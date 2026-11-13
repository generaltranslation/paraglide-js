import type { InlangProject } from "@inlang/sdk";
import nodePath from "node:path";
import type { Logger } from "../../services/logger/index.js";
import type { CliStep } from "../utils.js";
import {
  promptSelection,
  shellArgument,
  toRelativeDisplayPath,
} from "../utils.js";
import { updatePackageJson } from "./update-package-json.js";
import { INLANG_CLI_VERSION_RANGE } from "./add-inlang-check.js";

export type TranslationSetup = "gt" | "inlang" | "none";

/**
 * The `gt` range `init` adds. 2.28.2 is the first version tested with the
 * config `init` writes.
 */
export const GT_CLI_VERSION_RANGE = "^2.28.2";

export const TRANSLATING_MESSAGES_URL =
  "https://paraglidejs.com/translating-messages";

/**
 * Selects the text of every message, including nested messages and variant
 * branches, but not `$schema` or a variant's `declarations` and `selectors`,
 * which must stay untranslated for Paraglide to compile.
 */
export const GT_MESSAGE_TEXT_JSONPATH =
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
  const translation =
    ctx.translation ??
    (ctx.interactive === false
      ? "none"
      : await promptSelection<TranslationSetup>(
          "How do you want to translate your messages?",
          {
            initial: "gt",
            options: [
              {
                value: "gt",
                label: "General Translation (recommended, free tier)",
              },
              {
                value: "inlang",
                label:
                  "inlang CLI machine translation (free community service, no account)",
              },
              { value: "none", label: "Skip, I'll handle translations myself" },
            ],
          }
        ));

  if (translation === "gt") {
    const added = await addGeneralTranslation(ctx);
    return { ...ctx, translation: added ? "gt" : "none" };
  }
  if (translation === "inlang") await addMachineTranslation(ctx);
  return { ...ctx, translation };
};

/**
 * The `gt.config.json` that translates inlang message files in place.
 *
 * @example
 *   generalTranslationConfig({ baseLocale: "en", locales: ["en", "de"], messagePath: "messages/{locale}.json" })
 */
export function generalTranslationConfig(args: {
  baseLocale: string;
  locales: readonly string[];
  messagePath: string;
}) {
  return {
    $schema: "https://assets.gtx.dev/config-schema.json",
    defaultLocale: args.baseLocale,
    locales: args.locales.filter((locale) => locale !== args.baseLocale),
    files: {
      json: { include: [args.messagePath.replaceAll("{locale}", "[locale]")] },
    },
    options: {
      saveLocal: true,
      jsonSchema: {
        [args.messagePath.replaceAll("{locale}", "*")]: {
          include: [GT_MESSAGE_TEXT_JSONPATH],
        },
      },
    },
  };
}

/**
 * Target locales whose plurals need forms the base locale lacks, other than
 * the `many` form that a variant's `*` branch covers (French, Spanish).
 */
export function localesNeedingExtraPluralForms(
  baseLocale: string,
  locales: readonly string[]
): string[] {
  const categories = (locale: string) => {
    try {
      return new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
    } catch {
      return [];
    }
  };
  const base = new Set(categories(baseLocale));
  return locales.filter(
    (locale) =>
      locale !== baseLocale &&
      categories(locale).some(
        (category) => category !== "many" && !base.has(category)
      )
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
  const messagePath = toRelativeDisplayPath(
    ctx.root,
    nodePath.resolve(
      nodePath.dirname(nodePath.resolve(ctx.root, ctx.projectPath)),
      pathPattern
    )
  );

  const configPath = nodePath.join(ctx.root, "gt.config.json");
  const configExists = await ctx.fs.access(configPath).then(
    () => true,
    () => false
  );
  if (configExists) {
    ctx.logger.info(
      `Kept the existing gt.config.json. See ${TRANSLATING_MESSAGES_URL} for the settings Paraglide message files need.`
    );
  } else {
    const config = generalTranslationConfig({
      baseLocale: settings.baseLocale,
      locales: settings.locales,
      messagePath,
    });
    await ctx.fs.writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
    ctx.logger.success(
      "Added gt.config.json to translate your message files with General Translation."
    );
  }

  await updatePackageJson({
    devDependencies: async (devDeps) =>
      devDeps["gt"] ? devDeps : { ...devDeps, gt: GT_CLI_VERSION_RANGE },
    scripts: async (scripts) =>
      scripts["translate"]
        ? scripts
        : { ...scripts, translate: "gt translate" },
  })(ctx);
  ctx.logger.success(
    "Added gt to the devDependencies and a translate script to package.json."
  );

  const extraPluralForms = localesNeedingExtraPluralForms(
    settings.baseLocale,
    settings.locales
  );
  if (extraPluralForms.length > 0) {
    ctx.logger.warn(
      `General Translation does not yet add the extra plural forms that ${extraPluralForms.join(", ")} use. If your messages have plurals, remove these locales from gt.config.json for now. See ${TRANSLATING_MESSAGES_URL}#limits.`
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
