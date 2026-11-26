import type { Logger } from "../../services/logger/index.js";
import type { CliStep } from "../utils.js";
import { prompt, promptSelection, shellArgument } from "../utils.js";
import { detectJsonFormatting } from "../../utilities/detect-json-formatting.js";
import nodePath from "node:path";
import { execFile } from "node:child_process";
import { parse as parseEnv } from "dotenv";
import {
  INLANG_CLI_PACKAGE,
  INLANG_CLI_VERSION_RANGE,
  mayBeOlderThan,
} from "./add-inlang-check.js";

export const MACHINE_TRANSLATE_SCRIPT_NAME = "machine-translate";

const PROVIDER_ENV = "INLANG_MACHINE_TRANSLATE_PROVIDER";
const ENV_LOCAL = ".env.local";
const OWN_KEY =
  /^(?:INLANG_GOOGLE_TRANSLATE_API_KEY|INLANG_DEEPL_API_KEY|INLANG_OPENAI_API_KEY)$/;
const GT_CREDENTIAL =
  /^(?:GT_API_KEY|(?:\w*_)?GT_DEV_API_KEY|(?:\w*_)?GT_PROJECT_ID)$/;

/** `unknown` means configuration couldn't be read; `unchosen` means none was found. */
export type MachineTranslationProvider =
  | "gt"
  | "other"
  | "unchosen"
  | "unknown";

type Context = {
  fs: typeof import("node:fs/promises");
  logger: Logger;
  projectPath: string;
  root: string;
  packageJsonPath: string;
  interactive?: boolean;
  /** `true` adds the script, `"gt"` also chooses General Translation. */
  machineTranslation?: boolean | "gt";
};

export const maybeAddMachineTranslation: CliStep<
  Context,
  { machineTranslationProvider: MachineTranslationProvider | undefined }
> = async (ctx) => {
  const done = (machineTranslationProvider?: MachineTranslationProvider) => ({
    ...ctx,
    machineTranslationProvider,
  });
  if (
    ctx.machineTranslation === false ||
    (ctx.machineTranslation === undefined && ctx.interactive === false)
  )
    return done();

  const projectPath = nodePath.resolve(ctx.root, ctx.projectPath);
  const relativePath = nodePath.relative(ctx.root, projectPath);
  const readPackage = async () => {
    const text = await ctx.fs.readFile(ctx.packageJsonPath, "utf8");
    const pkg = JSON.parse(text);
    if (!pkg || typeof pkg !== "object" || Array.isArray(pkg))
      throw new Error("package.json must contain a valid JSON object.");
    const script = pkg.scripts?.[MACHINE_TRANSLATE_SCRIPT_NAME];
    const command = scriptForProject(script, relativePath, projectPath);
    if (script && !command) {
      ctx.logger.info(
        "Kept the machine-translate script and provider settings: init couldn't verify that the script runs the inlang CLI for this project."
      );
      return undefined;
    }
    return { pkg, text, script, command };
  };
  const initial = await readPackage();
  if (!initial) return done();

  // The inlang CLI reads its settings next to the project.
  const providerContext = {
    fs: ctx.fs,
    logger: ctx.logger,
    dir: nodePath.dirname(projectPath),
  };
  let provider = await chosenProvider(providerContext);
  let action: "gt" | "script" | "none";
  if (ctx.machineTranslation === true) action = "script";
  else if (provider !== "unchosen") {
    action =
      ctx.machineTranslation === "gt" ||
      initial.script ||
      (await prompt("Add a machine-translate script?", {
        type: "confirm",
        initial: true,
      }))
        ? "script"
        : "none";
  } else if (ctx.machineTranslation === "gt") action = "gt";
  else
    action = await promptSelection(
      "Which translation provider should this project use?",
      {
        initial: "gt",
        options: [
          {
            label: "General Translation (recommended)",
            value: "gt",
            hint: "free to start; sign in on the first run",
          },
          {
            label: "Another provider",
            value: "script",
            hint: "community service or other machine translation provider",
          },
          { label: "Skip", value: "none", hint: "no machine-translate script" },
        ],
      }
    );
  if (action === "none") return done();

  let version: string | undefined;
  let pinned: string | undefined;
  try {
    // A user or another tool may have edited the script while the prompt was open.
    const current = await readPackage();
    if (!current) return done();
    const { pkg, text, script, command } = current;
    version =
      pkg.devDependencies?.[INLANG_CLI_PACKAGE] ??
      pkg.dependencies?.[INLANG_CLI_PACKAGE];
    pinned = command?.version;
    if (!version)
      pkg.devDependencies = {
        ...pkg.devDependencies,
        [INLANG_CLI_PACKAGE]: INLANG_CLI_VERSION_RANGE,
      };
    if (!script)
      pkg.scripts = {
        ...pkg.scripts,
        [MACHINE_TRANSLATE_SCRIPT_NAME]: `inlang machine translate --project ${shellArgument(relativePath)}`,
      };
    if (!version || !script)
      await ctx.fs.writeFile(
        ctx.packageJsonPath,
        detectJsonFormatting(text)(pkg)
      );
    if (!version)
      ctx.logger.success(
        `Added ${INLANG_CLI_PACKAGE} ${INLANG_CLI_VERSION_RANGE} to the devDependencies in package.json.`
      );
    if (!script)
      ctx.logger.success("Added a machine-translate script to package.json.");
  } catch (error) {
    ctx.logger.error(
      `Couldn't set up machine translation in package.json: ${String(error)}`
    );
    if (ctx.interactive === false) throw error;
    return done();
  }

  // Preserve a provider selected while the prompt was open, too.
  if (action === "gt") provider = await chosenProvider(providerContext);
  if (ctx.machineTranslation === "gt" && provider === "other")
    ctx.logger.info(
      `Kept this project's machine translation provider. To use General Translation, remove ${PROVIDER_ENV} and provider API keys from the shell, ${ENV_LOCAL} and .env.`
    );
  if (
    action === "gt" &&
    provider === "unchosen" &&
    (await saveGtChoice(providerContext))
  )
    provider = "gt";

  version = pinned ?? version;
  if (
    provider === "gt" &&
    version &&
    mayBeOlderThan(version, { major: 3, minor: 7 })
  )
    ctx.logger.warn(
      `General Translation needs ${INLANG_CLI_PACKAGE} 3.7.0 or later. Your ${pinned ? "machine-translate script" : "package.json"} has "${version}". Update it to "${INLANG_CLI_VERSION_RANGE}".`
    );
  return done(provider);
};

/** Recognize commands we can verify, without interpreting arbitrary shell scripts. */
function scriptForProject(
  script: unknown,
  relativePath: string,
  projectPath: string
) {
  if (typeof script !== "string") return undefined;
  const match = script
    .trim()
    .match(
      /^(?:inlang|npx(?:[ \t]+(?:--yes|-y))?[ \t]+@inlang\/cli(?:@([\w.^~+-]+))?)[ \t]+machine[ \t]+translate[ \t]+--project(?:=|[ \t]+)(.+)$/
    );
  if (!match) return undefined;
  const matchesPath = [relativePath, "./" + relativePath, projectPath].some(
    (path) =>
      [
        shellArgument(path),
        ...(path.includes("'") ? [] : ["'" + path + "'"]),
        '"' + path.replace(/["\\$`]/g, "\\$&") + '"',
        ...(/^[\w./:@+-]+$/.test(path) ? [path] : []),
      ].includes(match[2]!)
  );
  return matchesPath ? { version: match[1] } : undefined;
}

async function saveGtChoice({
  fs,
  logger,
  dir,
}: {
  fs: Context["fs"];
  logger: Logger;
  dir: string;
}): Promise<boolean> {
  try {
    const file = nodePath.join(dir, ENV_LOCAL);
    if ((await fs.lstat(file).catch(() => undefined))?.isSymbolicLink())
      throw new Error(
        `${ENV_LOCAL} is a symbolic link, which init doesn't change.`
      );
    if ((await git(dir, "ls-files", "--error-unmatch")) === 0)
      throw new Error(
        `git tracks ${ENV_LOCAL}. Untrack it with \`git rm --cached ${ENV_LOCAL}\`.`
      );

    // Exit 1 means unignored. Outside Git, the CLI checks again before saving keys.
    if ((await git(dir, "check-ignore", "-q")) === 1) {
      const ignoreFile = nodePath.join(dir, ".gitignore");
      if ((await fs.lstat(ignoreFile).catch(() => undefined))?.isSymbolicLink())
        logger.warn(
          `Git doesn't ignore ${ENV_LOCAL}, and .gitignore is a symbolic link, which init doesn't change. Ignore ${ENV_LOCAL} before the first run so the inlang CLI can save its key.`
        );
      else {
        await appendLine(fs, ignoreFile, ENV_LOCAL);
        logger.success(`Added ${ENV_LOCAL} to .gitignore.`);
      }
    }
    await appendLine(fs, file, `${PROVIDER_ENV}=gt`, 0o600);
    logger.success(
      `Chose General Translation for machine translation in ${ENV_LOCAL}.`
    );
    return true;
  } catch (error) {
    logger.warn(
      `Didn't choose General Translation in ${ENV_LOCAL}: ${error instanceof Error ? error.message : String(error)} The inlang CLI asks for a provider on its first run.`
    );
    return false;
  }
}

/** Match the inlang CLI's provider precedence; never replace an existing choice. */
async function chosenProvider(args: {
  fs: typeof import("node:fs/promises");
  logger: Logger;
  dir: string;
}): Promise<MachineTranslationProvider> {
  // As the inlang CLI: the shell wins over `.env.local`, which wins over
  // `.env`, except that a blank provider setting in the shell falls back to
  // the files.
  let fileEnv: Record<string, string> = {};
  let env: Record<string, string | undefined>;
  let projectId: unknown;
  let file = "gt.config.json";
  try {
    for (file of [".env", ENV_LOCAL]) {
      const text = await readOptional(args.fs, nodePath.join(args.dir, file));
      if (text !== undefined) fileEnv = { ...fileEnv, ...parseEnv(text) };
    }
    env = { ...fileEnv, ...process.env };
    env[PROVIDER_ENV] =
      process.env[PROVIDER_ENV]?.trim() || fileEnv[PROVIDER_ENV];
    file = "gt.config.json";
    const config = await readOptional(args.fs, nodePath.join(args.dir, file));
    projectId = config && JSON.parse(config)?.projectId;
  } catch (error) {
    args.logger.warn(
      `Couldn't read ${file}, so init left the machine translation provider to the inlang CLI: ${error instanceof Error ? error.message : String(error)}`
    );
    return "unknown";
  }
  const set = (pattern: RegExp) =>
    Object.entries(env).some(
      ([name, value]) => pattern.test(name) && Boolean(value?.trim())
    );
  const provider = env[PROVIDER_ENV]?.trim();
  if (provider) return provider.toLowerCase() === "gt" ? "gt" : "other";
  if (set(OWN_KEY)) return "other";
  if (set(GT_CREDENTIAL)) return "gt";
  if (typeof projectId === "string" && projectId.trim()) return "gt";
  return "unchosen";
}

async function readOptional(
  fs: typeof import("node:fs/promises"),
  file: string
): Promise<string | undefined> {
  return fs.readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
}

/** Append a line without joining it to existing content. */
async function appendLine(
  fs: Context["fs"],
  file: string,
  line: string,
  mode?: number
) {
  const existing = await readOptional(fs, file);
  const separator = existing && !existing.endsWith("\n") ? "\n" : "";
  await fs.appendFile(
    file,
    separator + line + "\n",
    mode ? { mode } : undefined
  );
}

/** Exit code of `git <args> -- .env.local`, or undefined if Git couldn't run. */
function git(dir: string, ...args: string[]): Promise<number | undefined> {
  return new Promise((resolve) =>
    execFile("git", [...args, "--", ENV_LOCAL], { cwd: dir }, (error) =>
      resolve(
        error === null
          ? 0
          : typeof error.code === "number"
            ? error.code
            : undefined
      )
    )
  );
}
