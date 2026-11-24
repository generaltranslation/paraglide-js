import { toRelativeDisplayPath } from "../utils.js";
import {
  MACHINE_TRANSLATE_SCRIPT_NAME,
  type MachineTranslationSetup,
} from "./maybe-add-machine-translation.js";

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
  /** What `init` set up for machine translation. */
  machineTranslation?: MachineTranslationSetup;
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
    ...(args.machineTranslation === "gt"
      ? [
          `- To fill missing translations, run \`npm run ${MACHINE_TRANSLATE_SCRIPT_NAME} -- --no-browser\`. The first time, it prints a General Translation sign-in link and code: give them to the user.`,
        ]
      : args.machineTranslation === "script"
        ? [
            `- To fill missing translations, run \`npm run ${MACHINE_TRANSLATE_SCRIPT_NAME}\`.`,
          ]
        : []),
  ].join("\n");
}
