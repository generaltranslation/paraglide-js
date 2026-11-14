import type { InlangProject } from "@inlang/sdk";
import nodePath from "node:path";
import type { Logger } from "../../services/logger/index.js";
import type { CliStep } from "../utils.js";
import {
  messagePathFromRoot,
  promptSelection,
  shellArgument,
} from "../utils.js";
import { updatePackageJson } from "./update-package-json.js";
import { INLANG_CLI_VERSION_RANGE } from "./add-inlang-check.js";

export type TranslationSetup = "gt" | "inlang" | "none";

export const TRANSLATING_MESSAGES_URL =
  "https://paraglidejs.com/translating-messages";

/**
 * The `gt` range `init` adds. 2.28.2 is the first version tested with the
 * config `init` writes.
 */
const GT_CLI_VERSION_RANGE = "^2.28.2";

const GT_CONFIG_FILE = "gt.config.json";

const GT_CONFIG_SCHEMA_URL = "https://assets.gtx.dev/config-schema.json";

const TRANSLATE_SCRIPT_NAME = "translate";

/**
 * Selects the text of every message, including nested messages and variant
 * branches, but not `$schema` or a variant's `declarations` and `selectors`,
 * which must stay untranslated for Paraglide to compile.
 */
const GT_MESSAGE_TEXT_JSONPATH =
  "$..[?(typeof @ === 'string' && @property !== '$schema' && !(typeof @property === 'number' && (@parentProperty === 'declarations' || @parentProperty === 'selectors')))]";

type TranslationContext = {
  fs: typeof import("node:fs/promises");
  logger: Logger;
  project: InlangProject;
  projectPath: string;
  root: string;
  packageJsonPath: string;
  interactive?: boolean;
  translation?: TranslationSetup;
};

export const maybeAddTranslation: CliStep<
  TranslationContext,
  TranslationContext & { translation: TranslationSetup }
> = async (ctx) => {
  const translation = await chooseTranslation(ctx);
  if (translation === "gt") {
    const added = await addGeneralTranslation(ctx);
    return { ...ctx, translation: added ? "gt" : "none" };
  }
  if (translation === "inlang") await addMachineTranslation(ctx);
  return { ...ctx, translation };
};

async function chooseTranslation(
  ctx: TranslationContext
): Promise<TranslationSetup> {
  if (ctx.translation) return ctx.translation;
  if (ctx.interactive === false) return "none";
  return promptSelection<TranslationSetup>(
    "How do you want to translate your messages?",
    {
      initial: "gt",
      options: [
        { value: "gt", label: "General Translation (recommended, free tier)" },
        {
          value: "inlang",
          label:
            "inlang CLI machine translation (free community service, no account)",
        },
        { value: "none", label: "Skip, I'll handle translations myself" },
      ],
    }
  );
}

async function addGeneralTranslation(
  ctx: TranslationContext
): Promise<boolean> {
  const settings = await ctx.project.settings.get();
  const pathPattern = settings["plugin.inlang.messageFormat"]?.pathPattern;
  if (typeof pathPattern !== "string") {
    ctx.logger.warn(
      `init sets up General Translation for the inlang message format only. See ${TRANSLATING_MESSAGES_URL} to translate other files.`
    );
    return false;
  }
  const messagePath = messagePathFromRoot({
    root: ctx.root,
    projectPath: ctx.projectPath,
    pathPattern,
  });

  const configPath = nodePath.join(ctx.root, GT_CONFIG_FILE);
  const configExists = await ctx.fs.access(configPath).then(
    () => true,
    () => false
  );
  if (configExists) {
    ctx.logger.info(
      `Kept the existing ${GT_CONFIG_FILE}. See ${TRANSLATING_MESSAGES_URL} for the settings Paraglide message files need.`
    );
  } else {
    const config = {
      $schema: GT_CONFIG_SCHEMA_URL,
      defaultLocale: settings.baseLocale,
      locales: settings.locales.filter(
        (locale) => locale !== settings.baseLocale
      ),
      files: {
        json: { include: [messagePath.replaceAll("{locale}", "[locale]")] },
      },
      options: {
        saveLocal: true,
        jsonSchema: {
          [messagePath.replaceAll("{locale}", "*")]: {
            include: [GT_MESSAGE_TEXT_JSONPATH],
          },
        },
      },
    };
    await ctx.fs.writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
    ctx.logger.success(
      `Added ${GT_CONFIG_FILE} to translate your message files with General Translation.`
    );
  }

  let addedCli = false;
  let addedScript = false;
  await updatePackageJson({
    devDependencies: async (devDeps) => {
      if (devDeps["gt"] !== undefined) return devDeps;
      addedCli = true;
      return { ...devDeps, gt: GT_CLI_VERSION_RANGE };
    },
    scripts: async (scripts) => {
      if (scripts[TRANSLATE_SCRIPT_NAME] !== undefined) return scripts;
      addedScript = true;
      return { ...scripts, [TRANSLATE_SCRIPT_NAME]: "gt translate" };
    },
  })(ctx);
  if (addedCli) {
    ctx.logger.success("Added gt to the devDependencies in package.json.");
  }
  if (addedScript) {
    ctx.logger.success(
      `Added a ${TRANSLATE_SCRIPT_NAME} script that runs General Translation to package.json.`
    );
  }
  return true;
}

async function addMachineTranslation(ctx: TranslationContext) {
  try {
    const relativePath = nodePath.relative(ctx.root, ctx.projectPath);
    await updatePackageJson({
      devDependencies: async (devDeps) => {
        if (devDeps["@inlang/cli"]) return devDeps;
        return {
          ...devDeps,
          "@inlang/cli": INLANG_CLI_VERSION_RANGE,
        };
      },
      scripts: async (scripts) => {
        if (scripts["machine-translate"]) return scripts;
        return {
          ...scripts,
          "machine-translate": `inlang machine translate --project ${shellArgument(relativePath)}`,
        };
      },
    })(ctx);

    ctx.logger.success("Added a machine-translate script to package.json.");
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
  }
}
