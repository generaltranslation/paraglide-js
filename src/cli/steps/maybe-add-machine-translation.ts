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

/**
 * Variables that choose a provider for the inlang CLI's `machine translate`:
 * the provider setting, the bring-your-own keys and General Translation's key
 * and project ID (`GT_API_KEY`, `VITE_GT_DEV_API_KEY`, `GT_PROJECT_ID`, ...).
 */
const CHOOSES_PROVIDER =
  /^(?:INLANG_MACHINE_TRANSLATE_PROVIDER|INLANG_GOOGLE_TRANSLATE_API_KEY|INLANG_DEEPL_API_KEY|INLANG_OPENAI_API_KEY|GT_API_KEY|(?:\w*_)?GT_DEV_API_KEY|(?:\w*_)?GT_PROJECT_ID)$/;

/** A script that runs the inlang CLI's `machine translate`. */
const RUNS_INLANG_CLI = /\binlang\s+machine\s+translate\b/;

/**
 * What `init` set up for machine translation:
 * - `gt`: the script, with General Translation chosen in `.env.local`
 * - `script`: the script; the inlang CLI asks for a provider on its first run,
 *   unless the project already chose one
 * - `none`: nothing
 */
export type MachineTranslationSetup = "gt" | "script" | "none";

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
  { machineTranslationSetup: MachineTranslationSetup }
> = async (ctx) => {
  const done = (machineTranslationSetup: MachineTranslationSetup) => ({
    ...ctx,
    machineTranslationSetup,
  });
  if (
    ctx.machineTranslation === false ||
    (ctx.machineTranslation === undefined && ctx.interactive === false)
  )
    return done("none");

  const pkg = JSON.parse(await ctx.fs.readFile(ctx.packageJsonPath, "utf8"));
  const existing: string | undefined =
    pkg?.scripts?.[MACHINE_TRANSLATE_SCRIPT_NAME] || undefined;
  if (existing !== undefined && !RUNS_INLANG_CLI.test(existing)) {
    // Choosing a provider for the inlang CLI wouldn't change that command.
    ctx.logger.info(
      "Kept the machine-translate script in package.json, which doesn't run the inlang CLI."
    );
    return done("none");
  }

  // The inlang CLI reads its settings next to the project.
  const envDir = nodePath.dirname(nodePath.resolve(ctx.root, ctx.projectPath));
  let setup: MachineTranslationSetup;
  if (ctx.machineTranslation === true) setup = "script";
  else if (await providerChosen(ctx.fs, envDir)) {
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

  try {
    const relativePath = nodePath.relative(ctx.root, ctx.projectPath);
    let existingCli: string | undefined;
    await updatePackageJson({
      devDependencies: async (devDeps) => {
        existingCli = devDeps[INLANG_CLI_PACKAGE];
        if (existingCli !== undefined) return devDeps;
        return { ...devDeps, [INLANG_CLI_PACKAGE]: INLANG_CLI_VERSION_RANGE };
      },
      scripts: async (scripts) => {
        if (existing !== undefined) return scripts;
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
    if (existing === undefined)
      ctx.logger.success("Added a machine-translate script to package.json.");

    if (setup === "gt") {
      if (
        existingCli !== undefined &&
        mayBeOlderThan(existingCli, { major: 3, minor: 7 })
      )
        ctx.logger.warn(
          `General Translation needs ${INLANG_CLI_PACKAGE} 3.7.0 or later. Your package.json has "${existingCli}". Update it to "${INLANG_CLI_VERSION_RANGE}".`
        );
      const addedIgnoreRule = await appendToEnvLocal({
        fs: ctx.fs,
        dir: envDir,
        text: `${PROVIDER_ENV}=gt\n`,
      });
      ctx.logger.success(
        `Chose General Translation for machine translation in ${ENV_LOCAL}. To choose another provider, remove ${PROVIDER_ENV} from it.`
      );
      if (addedIgnoreRule)
        ctx.logger.success(`Added ${ENV_LOCAL} to .gitignore.`);
    }
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

  return done(setup);
};

/**
 * Whether the project already chose a machine translation provider for the
 * inlang CLI: in the shell, in `.env.local` or `.env`, or with a project ID in
 * `gt.config.json`. `init` never overrides that choice, and leaves it to the
 * inlang CLI when it can't read one of those files.
 */
async function providerChosen(
  fs: typeof import("node:fs/promises"),
  dir: string
): Promise<boolean> {
  const chooses = (variables: Record<string, string | undefined>) =>
    Object.entries(variables).some(
      ([name, value]) => CHOOSES_PROVIDER.test(name) && Boolean(value?.trim())
    );
  try {
    if (chooses(process.env)) return true;
    for (const file of [ENV_LOCAL, ".env"]) {
      const text = await readOptional(fs, nodePath.join(dir, file));
      if (text !== undefined && chooses(parseEnv(text))) return true;
    }
    const config = await readOptional(fs, nodePath.join(dir, "gt.config.json"));
    const projectId = config && JSON.parse(config)?.projectId;
    return typeof projectId === "string" && projectId.trim() !== "";
  } catch {
    return true;
  }
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
 * new, and resolves whether it first added `.env.local` to `.gitignore`
 * because git doesn't ignore it.
 */
async function appendToEnvLocal(args: {
  fs: typeof import("node:fs/promises");
  dir: string;
  text: string;
}): Promise<boolean> {
  const ignored = await new Promise<boolean>((resolve) =>
    execFile(
      "git",
      ["check-ignore", "-q", "--", ENV_LOCAL],
      { cwd: args.dir },
      (error) => resolve(!error)
    )
  );
  if (!ignored)
    await appendLine({
      fs: args.fs,
      file: nodePath.join(args.dir, ".gitignore"),
      text: `${ENV_LOCAL}\n`,
    });
  await appendLine({
    fs: args.fs,
    file: nodePath.join(args.dir, ENV_LOCAL),
    text: args.text,
    mode: 0o600,
  });
  return !ignored;
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
