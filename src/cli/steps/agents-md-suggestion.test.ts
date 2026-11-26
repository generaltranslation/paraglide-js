import { expect, test } from "vitest";
import { agentsMdSuggestion } from "./agents-md-suggestion.js";

test("the AGENTS.md suggestion names the project, message files and outdir", () => {
  const suggestion = agentsMdSuggestion({
    root: "/app",
    projectPath: "./project.inlang",
    pathPattern: "./messages/{locale}.json",
    outdir: "./src/paraglide",
  });
  for (const text of [
    "AGENTS.md",
    "## Localization",
    "`project.inlang/README.md`",
    "git-ignored",
    "`messages/{locale}.json`",
    "Never edit `src/paraglide/`",
  ])
    expect(suggestion).toContain(text);
  expect(suggestion).not.toContain("machine-translate");
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

test.each([
  [
    "gt",
    ["-- --no-browser", "background", "If sign-in is needed", "link and code"],
  ],
  ["other", ["`npm run machine-translate`"]],
  [
    "unchosen",
    ["confirm a provider", "ask the user", "terminal to choose one"],
  ],
  ["unknown", ["could not be read", "Resolve it before running"]],
] as const)("agent translation guidance handles %s", (provider, expected) => {
  const suggestion = agentsMdSuggestion({
    root: "/app",
    projectPath: "./project.inlang",
    outdir: "./src/paraglide",
    machineTranslation: provider,
  });
  expect(suggestion).toContain("npm run machine-translate");
  for (const text of expected) expect(suggestion).toContain(text);
  if (provider !== "gt") expect(suggestion).not.toContain("--no-browser");
});

test("the AGENTS.md suggestion points to the settings when init doesn't know the message files", () => {
  expect(
    agentsMdSuggestion({
      root: "/app",
      projectPath: "./project.inlang",
      outdir: "./src/paraglide",
    })
  ).toContain("`project.inlang/settings.json`");
});
