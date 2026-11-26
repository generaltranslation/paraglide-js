import { expect, test } from "vitest";
import { agentsMdSuggestion } from "./agents-md-suggestion.js";

test("the AGENTS.md suggestion names the project, message files and outdir", () => {
  expect(
    agentsMdSuggestion({
      root: "/app",
      projectPath: "./project.inlang",
      pathPattern: "./messages/{locale}.json",
      outdir: "./src/paraglide",
    })
  ).toBe(
    [
      "If you use coding agents, consider adding this to your AGENTS.md:",
      "",
      "## Localization",
      "- Translations are an inlang project. Before localization work, read `project.inlang/README.md`. It covers checks, machine translation and editors. It is git-ignored, so search tools may skip it.",
      "- Edit messages in `messages/{locale}.json`. Never edit `src/paraglide/`: Paraglide JS generates it.",
    ].join("\n")
  );
});

test("the AGENTS.md suggestion uses custom paths relative to the root", () => {
  const suggestion = agentsMdSuggestion({
    root: "/app",
    projectPath: "/app/i18n/project.inlang",
    pathPattern: "./i18n/{locale}/common.json",
    outdir: "./lib/paraglide/",
  });

  expect(suggestion).toContain("`i18n/project.inlang/README.md`");
  expect(suggestion).toContain("`i18n/{locale}/common.json`");
  expect(suggestion).toContain("Never edit `lib/paraglide/`");
});

test("the AGENTS.md suggestion handles an outdir at the root", () => {
  expect(
    agentsMdSuggestion({
      root: "/app",
      projectPath: "./project.inlang",
      pathPattern: "./messages/{locale}.json",
      outdir: "./",
    })
  ).toContain("Never edit `./`");
});

test("the AGENTS.md suggestion tells agents how to translate with the script's provider", () => {
  const base = {
    root: "/app",
    projectPath: "./project.inlang",
    pathPattern: "./messages/{locale}.json",
    outdir: "./src/paraglide",
  };
  expect(
    agentsMdSuggestion({ ...base, machineTranslation: "gt" })
      .split("\n")
      .at(-1)
  ).toBe(
    "- To fill missing translations, run `npm run machine-translate -- --no-browser`. The first time, it prints a General Translation sign-in link and code and waits until the user signs in: run it in the background and give them the link and code."
  );
  expect(
    agentsMdSuggestion({ ...base, machineTranslation: "other" })
      .split("\n")
      .at(-1)
  ).toBe("- To fill missing translations, run `npm run machine-translate`.");
  expect(
    agentsMdSuggestion({ ...base, machineTranslation: "unchosen" })
      .split("\n")
      .at(-1)
  ).toBe(
    "- To fill missing translations, run `npm run machine-translate`. If no provider is set up yet (no INLANG_MACHINE_TRANSLATE_PROVIDER or API key in `.env.local` or `.env`, and no `gt.config.json`), first ask the user to run it once in their terminal to choose one."
  );
  expect(agentsMdSuggestion(base)).not.toContain("machine-translate");
});

test("the AGENTS.md suggestion points to the settings when init doesn't know the message files", () => {
  expect(
    agentsMdSuggestion({
      root: "/app",
      projectPath: "./project.inlang",
      outdir: "./src/paraglide",
    })
  ).toContain(
    "- Edit messages in the files `project.inlang/settings.json` names. Never edit"
  );
});
