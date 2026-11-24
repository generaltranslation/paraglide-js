import type { Declaration, InlangProject, LocalVariable } from "@inlang/sdk";
import nodePath from "node:path";
import type { Logger } from "../../services/logger/index.js";
import type { CliStep } from "../utils.js";
import {
  mayBeOlderThan,
  messagePathFromRoot,
  promptSelection,
  shellArgument,
  toRelativeDisplayPath,
} from "../utils.js";
import { updatePackageJson } from "./update-package-json.js";
import { INLANG_CLI_VERSION_RANGE } from "./add-inlang-check.js";

import type { TranslationSetup } from "../init-options.js";
import { TRANSLATING_MESSAGES_URL } from "../defaults.js";

/** The first `gt` version tested with the config `init` writes. */
const GT_CLI_MIN_VERSION = "2.28.2";

const GT_CLI_VERSION_RANGE = `^${GT_CLI_MIN_VERSION}`;

const GT_CLI_PACKAGE = "gt";

const GT_CONFIG_FILE = "gt.config.json";

const GT_CONFIG_SCHEMA_URL = "https://assets.gtx.dev/config-schema.json";

const TRANSLATE_SCRIPT_NAME = "translate";

/** Paraglide accepts the legacy `{languageTag}` placeholder as well. */
const LOCALE_PLACEHOLDER = /\{(?:locale|languageTag)\}/g;

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
  const pathPattern: string | string[] | undefined =
    settings["plugin.inlang.messageFormat"]?.pathPattern;
  if (pathPattern === undefined) {
    ctx.logger.warn(
      `init sets up General Translation for the inlang message format only. See ${TRANSLATING_MESSAGES_URL} to translate other files.`
    );
    return false;
  }
  const messagePaths = [pathPattern].flat().map((pattern) =>
    messagePathFromRoot({
      root: ctx.root,
      projectPath: ctx.projectPath,
      pathPattern: pattern,
    })
  );

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
    const targetLocales = settings.locales.filter(
      (locale) => locale !== settings.baseLocale
    );
    if (targetLocales.length === 0) {
      const settingsPath = toRelativeDisplayPath(
        ctx.root,
        nodePath.join(ctx.projectPath, "settings.json")
      );
      ctx.logger.warn(
        `Skipped General Translation setup: ${settingsPath} has no target locales. Add them to its \`locales\`, then run init again with \`--translation gt\`.`
      );
      return false;
    }
    const missingPluralForms = await localesMissingPluralForms({
      project: ctx.project,
      baseLocale: settings.baseLocale,
      locales: targetLocales,
    });
    const unsupportedLocales = missingPluralForms ?? targetLocales;
    if (unsupportedLocales.length > 0) {
      const reason =
        missingPluralForms === undefined
          ? "init cannot safely check your complex plural selectors"
          : "your source plurals lack forms these languages need, and General Translation does not add missing forms yet";
      ctx.logger.warn(
        `Left ${unsupportedLocales.join(", ")} out of General Translation setup: ${reason}. See ${TRANSLATING_MESSAGES_URL}#limits.`
      );
    }
    const locales = targetLocales.filter(
      (locale) => !unsupportedLocales.includes(locale)
    );
    if (locales.length === 0) {
      ctx.logger.warn(
        "Skipped General Translation setup: no supported target locales remain."
      );
      return false;
    }
    const config = {
      $schema: GT_CONFIG_SCHEMA_URL,
      defaultLocale: settings.baseLocale,
      locales,
      files: {
        json: {
          include: messagePaths.map((path) =>
            path.replace(LOCALE_PLACEHOLDER, "[locale]")
          ),
        },
      },
      options: {
        saveLocal: true,
        jsonSchema: Object.fromEntries(
          messagePaths.map((path) => [
            path.replace(LOCALE_PLACEHOLDER, "*"),
            { include: [GT_MESSAGE_TEXT_JSONPATH] },
          ])
        ),
      },
    };
    await ctx.fs.writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
    ctx.logger.success(
      `Added ${GT_CONFIG_FILE} to translate your message files with General Translation.`
    );
  }

  const pkg = JSON.parse(await ctx.fs.readFile(ctx.packageJsonPath, "utf8"));
  const existingCli =
    pkg.dependencies?.[GT_CLI_PACKAGE] ?? pkg.devDependencies?.[GT_CLI_PACKAGE];
  const hasCli = existingCli !== undefined;
  if (
    hasCli &&
    mayBeOlderThan({ range: existingCli, version: GT_CLI_MIN_VERSION })
  ) {
    ctx.logger.warn(
      `General Translation setup is tested with gt ${GT_CLI_MIN_VERSION} or later. Your package.json has "${existingCli}". Update it to "${GT_CLI_VERSION_RANGE}" before running the setup commands.`
    );
  }
  let addedScript = false;
  await updatePackageJson({
    devDependencies: async (devDeps) =>
      hasCli ? devDeps : { ...devDeps, [GT_CLI_PACKAGE]: GT_CLI_VERSION_RANGE },
    scripts: async (scripts) => {
      if (scripts[TRANSLATE_SCRIPT_NAME] !== undefined) return scripts;
      addedScript = true;
      return { ...scripts, [TRANSLATE_SCRIPT_NAME]: "gt translate" };
    },
  })(ctx);
  if (!hasCli) {
    ctx.logger.success(
      `Added ${GT_CLI_PACKAGE} to the devDependencies in package.json.`
    );
  }
  if (addedScript) {
    ctx.logger.success(
      `Added a ${TRANSLATE_SCRIPT_NAME} script that runs General Translation to package.json.`
    );
  }
  return true;
}

/**
 * Target locales whose plural forms the source branches don't cover, or
 * undefined when a plural is too complex to check.
 */
async function localesMissingPluralForms(args: {
  project: InlangProject;
  baseLocale: string;
  locales: string[];
}): Promise<string[] | undefined> {
  const { selectBundleNested } = await import("@inlang/sdk");
  const bundles = await selectBundleNested(args.project.db).execute();
  const categories = new Map<string, Intl.LDMLPluralRule[]>();
  const unsupported = new Set<string>();
  for (const bundle of bundles) {
    const source = bundle.messages.find(
      (message) => message.locale === args.baseLocale
    );
    const plurals = bundle.declarations.filter(isPluralDeclaration);
    const [plural] = plurals;
    if (!source || !plural) continue;
    const type = pluralType(plural);
    if (
      plurals.length !== 1 ||
      type === undefined ||
      source.selectors.length !== 1 ||
      source.selectors[0]?.name !== plural.name
    )
      return undefined;
    const branches = new Set(
      source.variants
        .flatMap((variant) => variant.matches)
        .map((match) => (match.type === "literal-match" ? match.value : "*"))
    );
    // French and Spanish use the cardinal `many` only for large round numbers.
    const covered = (category: Intl.LDMLPluralRule) =>
      branches.has(category) ||
      (branches.has("*") &&
        (category === "other" || (type === "cardinal" && category === "many")));
    for (const locale of args.locales) {
      if (unsupported.has(locale)) continue;
      const key = `${locale}:${type}`;
      let forms = categories.get(key);
      if (!forms) {
        forms = new Intl.PluralRules(locale, { type }).resolvedOptions()
          .pluralCategories;
        categories.set(key, forms);
      }
      if (!forms.every(covered)) unsupported.add(locale);
    }
  }
  return args.locales.filter((locale) => unsupported.has(locale));
}

function isPluralDeclaration(
  declaration: Declaration
): declaration is LocalVariable {
  return (
    declaration.type === "local-variable" &&
    declaration.value.annotation?.name === "plural"
  );
}

/** The plural's `type`, or undefined when it comes from a variable. */
function pluralType(plural: LocalVariable): Intl.PluralRuleType | undefined {
  const option = plural.value.annotation?.options.find(
    (option) => option.name === "type"
  );
  if (!option) return "cardinal";
  if (
    option.value.type === "literal" &&
    (option.value.value === "cardinal" || option.value.value === "ordinal")
  )
    return option.value.value;
  return undefined;
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
