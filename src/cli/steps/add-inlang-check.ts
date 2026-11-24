import type { Logger } from "../../services/logger/index.js";
import {
  mayBeOlderThan,
  toRelativeDisplayPath,
  shellArgument,
  type CliStep,
} from "../utils.js";
import { updatePackageJson } from "./update-package-json.js";

/** The first `@inlang/cli` version with `inlang check`. */
const INLANG_CLI_MIN_VERSION = "3.4.0";

export const INLANG_CLI_VERSION_RANGE = `^${INLANG_CLI_MIN_VERSION}`;

export const CHECK_SCRIPT_NAME = "check:i18n";

/**
 * Adds `@inlang/cli` to the devDependencies (if not present) and a
 * `check:i18n` script that runs `inlang check` (if no script of that name
 * exists).
 */
export const addInlangCheck: CliStep<
  {
    fs: typeof import("node:fs/promises");
    logger: Logger;
    projectPath: string;
    root: string;
    packageJsonPath: string;
  },
  unknown
> = async (ctx) => {
  const projectPath = toRelativeDisplayPath(ctx.root, ctx.projectPath);
  let existingCli: string | undefined;
  let addedCli = false;
  let addedScript = false;

  await updatePackageJson({
    devDependencies: async (devDeps) => {
      existingCli = devDeps["@inlang/cli"];
      if (existingCli !== undefined) return devDeps;
      addedCli = true;
      return { ...devDeps, "@inlang/cli": INLANG_CLI_VERSION_RANGE };
    },
    scripts: async (scripts) => {
      if (scripts[CHECK_SCRIPT_NAME] !== undefined) return scripts;
      addedScript = true;
      return {
        ...scripts,
        [CHECK_SCRIPT_NAME]: `inlang check --project ${shellArgument("./" + projectPath)}`,
      };
    },
  })(ctx);

  if (addedCli) {
    ctx.logger.success(
      `Added @inlang/cli ${INLANG_CLI_VERSION_RANGE} to the devDependencies in package.json.`
    );
  }
  if (addedScript) {
    ctx.logger.success(
      `Added a ${CHECK_SCRIPT_NAME} script that checks the translations to package.json.`
    );
  }
  if (
    existingCli !== undefined &&
    mayBeOlderThan({ range: existingCli, version: INLANG_CLI_MIN_VERSION })
  ) {
    ctx.logger.warn(
      `\`inlang check\` needs @inlang/cli ${INLANG_CLI_MIN_VERSION} or later. Your package.json has "${existingCli}". Update it to "${INLANG_CLI_VERSION_RANGE}".`
    );
  }

  return ctx;
};
