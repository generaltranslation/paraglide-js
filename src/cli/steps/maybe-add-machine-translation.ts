import type { Logger } from "../../services/logger/index.js";
import type { CliStep } from "../utils.js";
import { prompt, promptSelection, shellArgument } from "../utils.js";
import { updatePackageJson } from "./update-package-json.js";
import nodePath from "node:path";
import { execFile } from "node:child_process";
import {
  INLANG_CLI_PACKAGE,
  INLANG_CLI_VERSION_RANGE,
  mayBeOlderThan,
} from "./add-inlang-check.js";

export const MACHINE_TRANSLATE_SCRIPT_NAME = "machine-translate";

/**
 * The inlang CLI's provider setting. It is read from the shell, `.env.local`
 * and `.env` in the folder that contains the inlang project.
 */
const PROVIDER_ENV = "INLANG_MACHINE_TRANSLATE_PROVIDER";

const ENV_LOCAL = ".env.local";

/** The bring-your-own keys, which the inlang CLI prefers to General Translation. */
const OWN_KEY =
  /^(?:INLANG_GOOGLE_TRANSLATE_API_KEY|INLANG_DEEPL_API_KEY|INLANG_OPENAI_API_KEY)$/;

/** General Translation's key and project ID (`GT_API_KEY`, `VITE_GT_DEV_API_KEY`, ...). */
const GT_CREDENTIAL =
  /^(?:GT_API_KEY|(?:\w*_)?GT_DEV_API_KEY|(?:\w*_)?GT_PROJECT_ID)$/;

/**
 * A script that runs the inlang CLI's `machine translate`: `inlang ...`, or
 * `npx @inlang/cli[@version] ...` as the docs show. Captures the version.
 */
const RUNS_INLANG_CLI =
  /(?:\binlang|@inlang\/cli(?:@(\S+))?)\s+machine\s+translate\b/;

/**
 * What `init` set up for machine translation:
 * - `gt`: the script, with General Translation chosen in `.env.local`
 * - `script`: the script; the inlang CLI asks for a provider on its first run,
 *   unless the project already chose one
 * - `none`: nothing
 */
export type MachineTranslationSetup = "gt" | "script" | "none";

/**
 * The provider the machine-translate script uses: General Translation,
 * another one the project chose, or none yet, so the inlang CLI asks on its
 * first run in a terminal and uses the community service without one.
 */
export type MachineTranslationProvider = "gt" | "other" | "unchosen";

export const maybeAddMachineTranslation: CliStep<
  {
    fs: typeof import("node:fs/promises");
    logger: Logger;
    projectPath: string;
    root: string;
    packageJsonPath: string;
    interactive?: boolean;
    /** `true` adds the script, `"gt"` also chooses General Translation. */
    machineTranslation?: boolean | "gt";
  },
  {
    machineTranslationSetup: MachineTranslationSetup;
    /** Undefined without a script. */
    machineTranslationProvider: MachineTranslationProvider | undefined;
  }
> = async (ctx) => {
  const done = (
    machineTranslationSetup: MachineTranslationSetup,
    machineTranslationProvider?: MachineTranslationProvider
  ) => ({ ...ctx, machineTranslationSetup, machineTranslationProvider });
  if (
    ctx.machineTranslation === false ||
    (ctx.machineTranslation === undefined && ctx.interactive === false)
  )
    return done("none");

  const pkg = JSON.parse(await ctx.fs.readFile(ctx.packageJsonPath, "utf8"));
  const existing: string | undefined =
    pkg?.scripts?.[MACHINE_TRANSLATE_SCRIPT_NAME] || undefined;
  const runsInlangCli = existing?.match(RUNS_INLANG_CLI);
  if (existing !== undefined && !runsInlangCli) {
    // Choosing a provider for the inlang CLI wouldn't change that command.
    ctx.logger.info(
      "Kept the machine-translate script in package.json, which doesn't run the inlang CLI."
    );
    return done("none");
  }

  // The inlang CLI reads its settings next to the project.
  const envDir = nodePath.dirname(nodePath.resolve(ctx.root, ctx.projectPath));
  const found = await chosenProvider({
    fs: ctx.fs,
    logger: ctx.logger,
    dir: envDir,
  });
  // A file init couldn't read is left to the inlang CLI, as another provider.
  const chosen = found === "unreadable" ? "other" : found;
  let setup: MachineTranslationSetup;
  if (ctx.machineTranslation === true) setup = "script";
  else if (chosen) {
    if (ctx.machineTranslation === "gt" && found === "other")
      ctx.logger.info(
        `Kept the machine translation provider this project already chose. To use General Translation, remove ${PROVIDER_ENV} and any provider API key from the shell, ${ENV_LOCAL} and .env.`
      );
    if (ctx.machineTranslation === "gt" || existing !== undefined)
      setup = "script";
    else
      setup = (await prompt("Add a machine-translate script?", {
        type: "confirm",
        initial: true,
      }))
        ? "script"
        : "none";
  } else if (ctx.machineTranslation === "gt") setup = "gt";
  else {
    // Worded as the inlang CLI asks on its first run.
    setup = await promptSelection<MachineTranslationSetup>(
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
          {
            label: "Skip",
            value: "none",
            hint: "no machine-translate script",
          },
        ],
      }
    );
  }
  if (setup === "none") return done(setup);

  const relativePath = nodePath.relative(ctx.root, ctx.projectPath);
  let existingCli: string | undefined;
  let addedScript = false;
  try {
    await updatePackageJson({
      devDependencies: async (devDeps) => {
        existingCli = devDeps[INLANG_CLI_PACKAGE];
        if (existingCli !== undefined) return devDeps;
        return { ...devDeps, [INLANG_CLI_PACKAGE]: INLANG_CLI_VERSION_RANGE };
      },
      scripts: async (scripts) => {
        if (scripts[MACHINE_TRANSLATE_SCRIPT_NAME]) return scripts;
        addedScript = true;
        return {
          ...scripts,
          [MACHINE_TRANSLATE_SCRIPT_NAME]: `inlang machine translate --project ${shellArgument(relativePath)}`,
        };
      },
    })(ctx);
    if (existingCli === undefined)
      ctx.logger.success(
        `Added ${INLANG_CLI_PACKAGE} ${INLANG_CLI_VERSION_RANGE} to the devDependencies in package.json.`
      );
    if (addedScript)
      ctx.logger.success("Added a machine-translate script to package.json.");
  } catch (error) {
    ctx.logger.error(
      [
        "Failed to set up machine translation. Please add it manually:",
        `1. Add ${INLANG_CLI_PACKAGE} to devDependencies`,
        "2. Add a machine-translate script to package.json",
        error,
      ].join("\n")
    );
    if (ctx.interactive === false) throw error;
    return done("none");
  }

  // A version in the script, e.g. `npx @inlang/cli@3.4.0`, wins.
  const pinned = runsInlangCli?.[1];
  const version = pinned ?? existingCli;
  if (
    (setup === "gt" || chosen === "gt") &&
    version !== undefined &&
    mayBeOlderThan(version, { major: 3, minor: 7 })
  )
    ctx.logger.warn(
      `General Translation needs ${INLANG_CLI_PACKAGE} 3.7.0 or later. Your ${pinned ? "machine-translate script" : "package.json"} has "${version}". Update it to "${INLANG_CLI_VERSION_RANGE}".`
    );
  if (setup !== "gt") return done(setup, chosen ?? "unchosen");

  // Without the choice saved, the inlang CLI asks on its first run.
  const notChosen = (reason: string) => {
    ctx.logger.warn(
      `Didn't choose General Translation: ${reason} The inlang CLI asks for a provider on its first run.`
    );
    return done("script", "unchosen");
  };
  const stats = await ctx.fs
    .lstat(nodePath.join(envDir, ENV_LOCAL))
    .catch(() => undefined);
  // It may be shared with other projects; the inlang CLI won't save a key to it.
  if (stats?.isSymbolicLink())
    return notChosen(
      `${ENV_LOCAL} is a symbolic link, which init doesn't change.`
    );
  // The inlang CLI won't save a key to it: it would be committed.
  if ((await git({ dir: envDir, args: ["ls-files", "--error-unmatch"] })) === 0)
    return notChosen(
      `git tracks ${ENV_LOCAL}. Untrack it with \`git rm --cached ${ENV_LOCAL}\`.`
    );
  let ignoreRule: Awaited<ReturnType<typeof appendToEnvLocal>>;
  try {
    ignoreRule = await appendToEnvLocal({
      fs: ctx.fs,
      dir: envDir,
      text: `${PROVIDER_ENV}=gt\n`,
    });
  } catch (error) {
    return notChosen(
      `couldn't save the choice to ${ENV_LOCAL} (${error instanceof Error ? error.message : String(error)}).`
    );
  }
  ctx.logger.success(
    `Chose General Translation for machine translation in ${ENV_LOCAL}. To choose another provider, remove ${PROVIDER_ENV} from it.`
  );
  if (ignoreRule === "added")
    ctx.logger.success(`Added ${ENV_LOCAL} to .gitignore.`);
  else if (ignoreRule === "missing")
    // git doesn't read a symlinked .gitignore, and it may be shared.
    ctx.logger.warn(
      `Git doesn't ignore ${ENV_LOCAL}, and .gitignore is a symbolic link, which init doesn't change. Ignore ${ENV_LOCAL} before the first run: the inlang CLI only saves a key to an ignored file.`
    );
  return done("gt", "gt");
};

/**
 * The machine translation provider the project already chose for the inlang
 * CLI: in the shell, in `.env.local` or `.env`, or with a project ID in
 * `gt.config.json`. `init` never overrides that choice. When it can't read one
 * of those files, it warns and resolves `unreadable`.
 */
async function chosenProvider(args: {
  fs: typeof import("node:fs/promises");
  logger: Logger;
  dir: string;
}): Promise<"gt" | "other" | "unreadable" | undefined> {
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
    return "unreadable";
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
  return undefined;
}

/** The variables of a `.env` file: `NAME=value`, optionally quoted or exported. */
function parseEnv(text: string): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(
      /^\s*(?:export\s+)?([\w.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^#]*))/
    );
    if (!match) continue;
    variables[match[1]!] = (match[2] ?? match[3] ?? match[4] ?? "").trim();
  }
  return variables;
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

/**
 * Appends `text` to `dir/.env.local`, which only the user can read if it is
 * new. If git doesn't ignore `.env.local`, it first adds it to `.gitignore`
 * (`added`), unless `.gitignore` is a symbolic link (`missing`). Outside a git
 * repository, `.gitignore` is left alone: the inlang CLI checks again before
 * it saves a key there.
 */
async function appendToEnvLocal(args: {
  fs: typeof import("node:fs/promises");
  dir: string;
  text: string;
}): Promise<"added" | "missing" | undefined> {
  // `git check-ignore` exits with 1 for a file it doesn't ignore.
  const notIgnored =
    (await git({ dir: args.dir, args: ["check-ignore", "-q"] })) === 1;
  let ignoreRule: "added" | "missing" | undefined;
  if (notIgnored) {
    const gitignore = nodePath.join(args.dir, ".gitignore");
    const stats = await args.fs.lstat(gitignore).catch(() => undefined);
    if (stats?.isSymbolicLink()) ignoreRule = "missing";
    else {
      await appendLine({
        fs: args.fs,
        file: gitignore,
        text: `${ENV_LOCAL}\n`,
      });
      ignoreRule = "added";
    }
  }
  await appendLine({
    fs: args.fs,
    file: nodePath.join(args.dir, ENV_LOCAL),
    text: args.text,
    mode: 0o600,
  });
  return ignoreRule;
}

/** Appends `text`, starting on a new line if the file doesn't end with one. */
async function appendLine(args: {
  fs: typeof import("node:fs/promises");
  file: string;
  text: string;
  mode?: number;
}): Promise<void> {
  const existing = await readOptional(args.fs, args.file);
  const separator = existing && !existing.endsWith("\n") ? "\n" : "";
  await args.fs.appendFile(
    args.file,
    separator + args.text,
    args.mode ? { mode: args.mode } : undefined
  );
}

/**
 * Runs `git <args> -- .env.local` in `dir` and resolves its exit code, or
 * undefined if git couldn't run.
 */
function git(args: {
  dir: string;
  args: string[];
}): Promise<number | undefined> {
  return new Promise((resolve) =>
    execFile(
      "git",
      [...args.args, "--", ENV_LOCAL],
      { cwd: args.dir },
      (error) =>
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
