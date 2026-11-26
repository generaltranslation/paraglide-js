import type { Logger } from "../../services/logger/index.js";
import {
  toRelativeDisplayPath,
  shellArgument,
  type CliStep,
} from "../utils.js";
import { updatePackageJson } from "./update-package-json.js";

/**
 * The `@inlang/cli` range `init` adds. 3.4.0 introduced `inlang check`, and
 * 3.7.0 made General Translation the default for `machine translate`.
 */
export const INLANG_CLI_VERSION_RANGE = "^3.7.1";

export const INLANG_CLI_PACKAGE = "@inlang/cli";

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
      existingCli = devDeps[INLANG_CLI_PACKAGE];
      if (existingCli !== undefined) return devDeps;
      addedCli = true;
      return { ...devDeps, [INLANG_CLI_PACKAGE]: INLANG_CLI_VERSION_RANGE };
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
    mayBeOlderThan(existingCli, { major: 3, minor: 4 })
  ) {
    ctx.logger.warn(
      `\`inlang check\` needs @inlang/cli 3.4.0 or later. Your package.json has "${existingCli}". Update it to "${INLANG_CLI_VERSION_RANGE}".`
    );
  }

  return ctx;
};

/**
 * Whether a version range may resolve to a version before `major.minor`,
 * judged by the first version it names (`^3.0.0`, `3.2.0`, `~2.1.0`).
 * Ranges without a version (`latest`, `*`, `workspace:*`) are trusted.
 */
export function mayBeOlderThan(
  range: string,
  { major, minor }: { major: number; minor: number }
): boolean {
  const match = range.match(/(\d+)\.(\d+)/);
  if (!match) return false;
  const rangeMajor = Number(match[1]);
  const rangeMinor = Number(match[2]);
  return rangeMajor < major || (rangeMajor === major && rangeMinor < minor);
}
