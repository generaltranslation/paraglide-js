import type { Logger } from "../../services/logger/index.js";
import type { CliStep } from "../utils.js";
import { prompt, promptSelection, shellArgument } from "../utils.js";
import { updatePackageJson } from "./update-package-json.js";
import nodePath from "node:path";
import { execFile } from "node:child_process";
import {
  INLANG_CLI_VERSION_RANGE,
  mayBeOlderThan,
} from "./add-inlang-check.js";

export const MACHINE_TRANSLATE_SCRIPT_NAME = "machine-translate";

/**
 * The inlang CLI's provider setting. It is read from the shell, `.env.local`
 * and `.env` in the folder that contains the inlang project.
 */
export const PROVIDER_ENV = "INLANG_MACHINE_TRANSLATE_PROVIDER";

/**
 * Variables that choose a provider for the inlang CLI's `machine translate`:
 * the provider setting, the bring-your-own keys and General Translation's key
 * and project ID (`GT_API_KEY`, `VITE_GT_DEV_API_KEY`, `GT_PROJECT_ID`, ...).
 */
const CHOOSES_PROVIDER =
  /^(?:INLANG_MACHINE_TRANSLATE_PROVIDER|INLANG_GOOGLE_TRANSLATE_API_KEY|INLANG_DEEPL_API_KEY|INLANG_OPENAI_API_KEY|GT_API_KEY|(?:\w*_)?GT_DEV_API_KEY|(?:\w*_)?GT_PROJECT_ID)$/;

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
  // The inlang CLI reads its settings next to the project.
  const envDir = nodePath.dirname(nodePath.resolve(ctx.root, ctx.projectPath));
  const chosen = await providerChosen(ctx.fs, envDir);

  let setup: MachineTranslationSetup;
  if (ctx.machineTranslation === false) setup = "none";
  else if (ctx.machineTranslation === "gt") setup = chosen ? "script" : "gt";
  else if (ctx.machineTranslation === true) setup = "script";
  else if (ctx.interactive === false) setup = "none";
  else if (chosen) {
    // The project already has a provider; only the script is missing.
    setup = (await prompt("Add a machine-translate script?", {
      type: "confirm",
      initial: true,
    }))
      ? "script"
      : "none";
  } else {
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
            hint: "community service, DeepL, Google or OpenAI; choose on the first run",
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

  if (setup === "none") return { ...ctx, machineTranslationSetup: setup };

  try {
    const relativePath = nodePath.relative(ctx.root, ctx.projectPath);
    let existingCli: string | undefined;
    let addedScript = false;
    await updatePackageJson({
      devDependencies: async (devDeps) => {
        existingCli = devDeps["@inlang/cli"];
        if (existingCli !== undefined) return devDeps;
        return { ...devDeps, "@inlang/cli": INLANG_CLI_VERSION_RANGE };
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
    if (addedScript)
      ctx.logger.success("Added a machine-translate script to package.json.");
    if (existingCli !== undefined && mayBeOlderThan(existingCli, 3, 7)) {
      ctx.logger.warn(
        `Machine translation with General Translation needs @inlang/cli 3.7.0 or later. Your package.json has "${existingCli}". Update it to "${INLANG_CLI_VERSION_RANGE}".`
      );
    }

    if (setup === "gt") {
      const addedIgnoreRule = await appendToEnvLocal(
        ctx.fs,
        envDir,
        `${PROVIDER_ENV}=gt\n`
      );
      ctx.logger.success(
        `Chose General Translation for machine translation in .env.local. To choose another provider, remove ${PROVIDER_ENV} from it.`
      );
      if (addedIgnoreRule)
        ctx.logger.success("Added .env.local to .gitignore.");
    }
  } catch (error) {
    ctx.logger.error(
      [
        "Failed to set up machine translation. Please add it manually:",
        "1. Add @inlang/cli to devDependencies",
        "2. Add a machine-translate script to package.json",
        error,
      ].join("\n")
    );
    if (ctx.interactive === false) throw error;
    return { ...ctx, machineTranslationSetup: "none" };
  }

  return { ...ctx, machineTranslationSetup: setup };
};

/**
 * Whether the project already chose a machine translation provider for the
 * inlang CLI: in the shell, in `.env.local` or `.env`, or with a project ID in
 * `gt.config.json`. `init` never overrides that choice.
 */
async function providerChosen(
  fs: typeof import("node:fs/promises"),
  dir: string
): Promise<boolean> {
  const chooses = (variables: Record<string, string | undefined>) =>
    Object.entries(variables).some(
      ([name, value]) => CHOOSES_PROVIDER.test(name) && Boolean(value?.trim())
    );
  if (chooses(process.env)) return true;
  for (const file of [".env.local", ".env"]) {
    const text = await readOptional(fs, nodePath.join(dir, file));
    if (text !== undefined && chooses(parseEnv(text))) return true;
  }
  const config = await readOptional(fs, nodePath.join(dir, "gt.config.json"));
  if (config === undefined) return false;
  try {
    const projectId = JSON.parse(config)?.projectId;
    return typeof projectId === "string" && projectId.trim() !== "";
  } catch {
    // gt's file, which `init` can't read: leave the choice to the inlang CLI.
    return true;
  }
}

/** The variables of a `.env` file: `NAME=value`, optionally quoted or exported. */
export function parseEnv(text: string): Record<string, string> {
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
 * new, and resolves whether it first added `.env.local` to `.gitignore`. As the
 * inlang CLI does: unless git ignores the file, or, where git can't tell,
 * `.env.local` is the last rule in `.gitignore`.
 */
async function appendToEnvLocal(
  fs: typeof import("node:fs/promises"),
  dir: string,
  text: string
): Promise<boolean> {
  const gitignore = nodePath.join(dir, ".gitignore");
  const ignored =
    (await gitIgnores(dir, ".env.local")) ||
    ((await readOptional(fs, gitignore)) ?? "")
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .at(-1)
      ?.trimEnd()
      .replace(/^\//, "") === ".env.local";
  if (!ignored) await appendLine(fs, gitignore, ".env.local\n");
  await appendLine(fs, nodePath.join(dir, ".env.local"), text, 0o600);
  return !ignored;
}

/** Appends `text`, starting on a new line if the file doesn't end with one. */
async function appendLine(
  fs: typeof import("node:fs/promises"),
  file: string,
  text: string,
  mode?: number
): Promise<void> {
  const existing = await readOptional(fs, file);
  const separator = existing && !existing.endsWith("\n") ? "\n" : "";
  await fs.appendFile(file, separator + text, mode ? { mode } : undefined);
}

function gitIgnores(dir: string, file: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("git", ["check-ignore", "-q", "--", file], { cwd: dir }, (error) =>
      resolve(!error)
    );
  });
}
