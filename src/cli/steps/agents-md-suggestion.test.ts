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
      "- To translate messages, we recommend General Translation (`npx gt translate`). The inlang CLI's machine translation, another translation service or hand edits also work. See https://paraglidejs.com/translating-messages.",
    ].join("\n")
  );
});

test("the AGENTS.md suggestion names the translation setup init added", () => {
  const args = {
    root: "/app",
    projectPath: "./project.inlang",
    pathPattern: "./messages/{locale}.json",
    outdir: "./src/paraglide",
  };
  expect(agentsMdSuggestion({ ...args, translation: "gt" })).toContain(
    "- Translate messages with General Translation: run `npx gt translate`"
  );
  expect(agentsMdSuggestion({ ...args, translation: "inlang" })).toContain(
    "- Fill missing translations with `npm run machine-translate`"
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
