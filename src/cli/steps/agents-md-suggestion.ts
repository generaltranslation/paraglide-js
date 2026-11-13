import { toRelativeDisplayPath } from "../utils.js";
import {
  TRANSLATING_MESSAGES_URL,
  type TranslationSetup,
} from "./maybe-add-translation.js";

/**
 * The localization section `init` suggests adding to AGENTS.md. `init` only
 * prints it and never writes AGENTS.md.
 */
export function agentsMdSuggestion(args: {
  root: string;
  projectPath: string;
  /** The message files, e.g. `./messages/{locale}.json`. */
  pathPattern: string;
  outdir: string;
  /** The translation setup `init` added, if any. */
  translation?: TranslationSetup;
}): string {
  const projectPath = toRelativeDisplayPath(args.root, args.projectPath);
  const pathPattern = toRelativeDisplayPath(args.root, args.pathPattern);
  // an outdir of `./` is the root itself
  const outdir = toRelativeDisplayPath(args.root, args.outdir) || ".";
  return [
    "If you use coding agents, consider adding this to your AGENTS.md:",
    "",
    "## Localization",
    `- Translations are an inlang project. Before localization work, read \`${projectPath}/README.md\`. It covers checks, machine translation and editors. It is git-ignored, so search tools may skip it.`,
    `- Edit messages in \`${pathPattern}\`. Never edit \`${outdir}/\`: Paraglide JS generates it.`,
    translationLine(args.translation),
  ].join("\n");
}

function translationLine(translation: TranslationSetup | undefined): string {
  if (translation === "gt")
    return `- Translate messages with General Translation: run \`npx gt translate\` after changing source messages. See ${TRANSLATING_MESSAGES_URL} for setup and limits.`;
  if (translation === "inlang")
    return `- Fill missing translations with \`npm run machine-translate\` (inlang CLI). See ${TRANSLATING_MESSAGES_URL} for other options.`;
  return `- To translate messages, we recommend General Translation (\`npx gt translate\`). The inlang CLI's machine translation, another translation service or hand edits also work. See ${TRANSLATING_MESSAGES_URL}.`;
}
