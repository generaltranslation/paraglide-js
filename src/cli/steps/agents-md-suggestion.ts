import { toRelativeDisplayPath } from "../utils.js";
import {
  MACHINE_TRANSLATE_SCRIPT_NAME,
  type MachineTranslationProvider,
} from "./maybe-add-machine-translation.js";

const RUN = `- To fill missing translations, run \`npm run ${MACHINE_TRANSLATE_SCRIPT_NAME}`;

/** How agents fill missing translations, by the script's provider. */
const TRANSLATE_LINE: Record<MachineTranslationProvider, string> = {
  gt: `${RUN} -- --no-browser\`. The first time, it prints a General Translation sign-in link and code and waits until the user signs in: run it in the background and give them the link and code.`,
  other: `${RUN}\`.`,
  unchosen: `${RUN}\`. If no provider is set up yet (no INLANG_MACHINE_TRANSLATE_PROVIDER or API key in \`.env.local\` or \`.env\`, and no \`projectId\` in \`gt.config.json\`), first ask the user to run it once in their terminal to choose one.`,
};

/**
 * The localization section `init` suggests adding to AGENTS.md. `init` only
 * prints it and never writes AGENTS.md.
 */
export function agentsMdSuggestion(args: {
  root: string;
  projectPath: string;
  /** The message files, e.g. `./messages/{locale}.json`, if init knows them. */
  pathPattern?: string;
  outdir: string;
  /** The machine-translate script's provider, if there is a script. */
  machineTranslation?: MachineTranslationProvider;
}): string {
  const projectPath = toRelativeDisplayPath(args.root, args.projectPath);
  const messages = args.pathPattern
    ? `\`${toRelativeDisplayPath(args.root, args.pathPattern)}\``
    : `the files \`${projectPath}/settings.json\` names`;
  // an outdir of `./` is the root itself
  const outdir = toRelativeDisplayPath(args.root, args.outdir) || ".";
  return [
    "If you use coding agents, consider adding this to your AGENTS.md:",
    "",
    "## Localization",
    `- Translations are an inlang project. Before localization work, read \`${projectPath}/README.md\`. It covers checks, machine translation and editors. It is git-ignored, so search tools may skip it.`,
    `- Edit messages in ${messages}. Never edit \`${outdir}/\`: Paraglide JS generates it.`,
    ...(args.machineTranslation
      ? [TRANSLATE_LINE[args.machineTranslation]]
      : []),
  ].join("\n");
}
