import { test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  mkdir,
  mkdtemp,
  writeFile,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Logger } from "../../../services/logger/index.js";
import { checkForUncommittedChanges } from "../../steps/check-for-uncomitted-changes.js";
import { fileURLToPath } from "node:url";
import * as defaults from "../../defaults.js";
import * as utils from "../../utils.js";
import { createInitCommand, runInit } from "./command.js";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "paraglide-init-test-"));
  vi.spyOn(process, "cwd").mockReturnValue(root);
  vi.spyOn(utils, "prompt").mockImplementation(async () => {
    throw new Error("Unexpected prompt in headless init");
  });
  vi.spyOn(utils, "promptSelection").mockImplementation(async () => {
    throw new Error("Unexpected select in headless init");
  });
  const original = defaults.getNewProjectTemplate;
  vi.spyOn(defaults, "getNewProjectTemplate").mockImplementation(() => ({
    ...original(),
    modules: [
      fileURLToPath(
        new URL(
          "../../../../node_modules/@inlang/plugin-message-format/dist/index.js",
          import.meta.url
        )
      ),
    ],
  }));
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "fixture",
      version: "1.0.0",
      scripts: { build: "vite build" },
    })
  );
});
afterEach(async () => {
  vi.restoreAllMocks();
  process.exitCode = 0;
  await rm(root, { recursive: true, force: true });
});

test("headless setup and rerun preserve project/messages/comments and skip optional tools", async () => {
  await writeFile(
    join(root, "tsconfig.json"),
    '// keep this comment\n{ "compilerOptions": { "strict": true, }, }\n'
  );
  await runInit({ yes: true, compile: false });
  const packageFirst = await readFile(join(root, "package.json"), "utf8");
  const settingsFirst = await readFile(
    join(root, "project.inlang/settings.json"),
    "utf8"
  );
  const messagesFirst = await readFile(join(root, "messages/en.json"), "utf8");
  await runInit({ nonInteractive: true, compile: false });
  expect(await readFile(join(root, "package.json"), "utf8")).toBe(packageFirst);
  expect(
    await readFile(join(root, "project.inlang/settings.json"), "utf8")
  ).toBe(settingsFirst);
  expect(await readFile(join(root, "messages/en.json"), "utf8")).toBe(
    messagesFirst
  );
  const tsconfig = await readFile(join(root, "tsconfig.json"), "utf8");
  expect(tsconfig).toContain("keep this comment");
  expect(tsconfig).toBe(
    '// keep this comment\n{ "compilerOptions": { "strict": true, }, }\n'
  );
  expect(tsconfig).toContain('"strict": true');
  const pkg = JSON.parse(packageFirst);
  expect(pkg.scripts["machine-translate"]).toBeUndefined();
  expect(pkg.scripts["lint:i18n"]).toBeUndefined();
  expect(pkg.devDependencies.eslint).toBeUndefined();
  expect(utils.prompt).not.toHaveBeenCalled();
  expect(utils.promptSelection).not.toHaveBeenCalled();
});

test("headless General Translation setup writes gt.config.json and a translate script, and keeps an existing config", async () => {
  await runInit({ yes: true, compile: false, translation: "gt" });
  const config = JSON.parse(
    await readFile(join(root, "gt.config.json"), "utf8")
  );
  expect(config).toMatchObject({
    defaultLocale: "en",
    locales: ["de"],
    files: { json: { include: ["messages/[locale].json"] } },
    options: { saveLocal: true },
  });
  expect(Object.keys(config.options.jsonSchema)).toEqual(["messages/*.json"]);
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  expect(pkg.devDependencies.gt).toBeDefined();
  expect(pkg.scripts.translate).toBe("gt translate");
  expect(pkg.scripts["machine-translate"]).toBeUndefined();
  expect(utils.promptSelection).not.toHaveBeenCalled();

  await writeFile(join(root, "gt.config.json"), '{ "locales": ["fr"] }\n');
  await runInit({ yes: true, compile: false, translation: "gt" });
  expect(await readFile(join(root, "gt.config.json"), "utf8")).toBe(
    '{ "locales": ["fr"] }\n'
  );
});

test.each([
  ["dependencies", "2.20.0", true],
  ["devDependencies", "~2.28.1", true],
  ["devDependencies", "2.28", true],
  ["devDependencies", "^2.28.2", false],
  ["dependencies", "^3.0.0", false],
  ["devDependencies", "latest", false],
  ["devDependencies", "workspace:*", false],
] as const)(
  "General Translation checks existing %s gt %s without replacing it",
  async (field, version, warning) => {
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ name: "fixture", [field]: { gt: version } })
    );
    const warn = vi.spyOn(Logger.prototype, "warn");
    await runInit({ yes: true, compile: false, translation: "gt" });
    const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    expect(pkg[field].gt).toBe(version);
    expect(
      pkg[field === "dependencies" ? "devDependencies" : "dependencies"]?.gt
    ).toBeUndefined();
    const message = expect.stringContaining('Update it to "^2.28.2"');
    if (warning) expect(warn).toHaveBeenCalledWith(message);
    else expect(warn).not.toHaveBeenCalledWith(message);
  }
);

test("General Translation setup reads every message path and leaves out locales whose plurals it can't translate", async () => {
  await mkdir(join(root, "project.inlang"));
  await mkdir(join(root, "messages/extra"), { recursive: true });
  await writeFile(
    join(root, "project.inlang/settings.json"),
    JSON.stringify({
      baseLocale: "en",
      locales: ["en", "de", "fr", "ru"],
      modules: defaults.getNewProjectTemplate().modules,
      "plugin.inlang.messageFormat": {
        pathPattern: [
          "./messages/{languageTag}.json",
          "./messages/extra/{locale}.json",
        ],
      },
    })
  );
  await writeFile(
    join(root, "messages/en.json"),
    JSON.stringify({
      cart_items: [
        {
          declarations: ["input count", "local countPlural = count: plural"],
          selectors: ["countPlural"],
          match: {
            "countPlural=one": "{count} item",
            "countPlural=*": "{count} items",
          },
        },
      ],
    })
  );
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "fixture",
      dependencies: { gt: "^2.0.0" },
    })
  );

  await runInit({ yes: true, compile: false, translation: "gt" });

  const config = JSON.parse(
    await readFile(join(root, "gt.config.json"), "utf8")
  );
  expect(config.locales).toEqual(["de", "fr"]);
  expect(config.files.json.include).toEqual([
    "messages/[locale].json",
    "messages/extra/[locale].json",
  ]);
  expect(Object.keys(config.options.jsonSchema)).toEqual([
    "messages/*.json",
    "messages/extra/*.json",
  ]);
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  expect(pkg.devDependencies?.gt).toBeUndefined();
});

test.each([
  {
    name: "cardinal plurals unsupported by every target",
    baseLocale: "en",
    locales: ["en", "ru"],
    declarations: ["local placePlural = place: plural"],
    match: {
      "placePlural=one": "{place} item",
      "placePlural=*": "{place} items",
    },
    expected: [],
    warning: "source plurals lack forms",
  },
  {
    name: "projects without target locales",
    baseLocale: "en",
    locales: ["en"],
    declarations: ["local placePlural = place: plural"],
    match: { "placePlural=*": "{place} items" },
    expected: [],
  },
  {
    name: "ordinal plurals",
    baseLocale: "de",
    locales: ["de", "en", "ja"],
    declarations: ["local placePlural = place: plural type=ordinal"],
    match: { "placePlural=*": "{place}." },
    expected: ["ja"],
  },
  {
    name: "cardinal plurals without a * branch",
    baseLocale: "en",
    locales: ["en", "fr", "ja"],
    declarations: ["local placePlural = place: plural"],
    match: {
      "placePlural=one": "{place} item",
      "placePlural=other": "{place} items",
    },
    expected: ["ja"],
  },
  {
    name: "plurals selected together with another variable",
    baseLocale: "en",
    locales: ["en", "de", "is"],
    declarations: ["input gender", "local placePlural = place: plural"],
    selectors: ["gender", "placePlural"],
    match: {
      "gender=female, placePlural=one": "{place} item",
      "gender=*, placePlural=*": "{place} items",
    },
    expected: [],
    warning: "complex plural selectors",
  },
  {
    name: "aliased plurals",
    baseLocale: "en",
    locales: ["en", "ru", "ja"],
    declarations: [
      "local rawPlural = place: plural",
      "local placePlural = rawPlural",
    ],
    match: {
      "placePlural=one": "{place} item",
      "placePlural=*": "{place} items",
    },
    expected: [],
    warning: "complex plural selectors",
  },
  {
    name: "plurals whose type is a variable",
    baseLocale: "de",
    locales: ["de", "en", "ja"],
    declarations: [
      "input mode",
      "local placePlural = place: plural type=$mode",
    ],
    match: { "placePlural=one": "{place}st", "placePlural=*": "{place}th" },
    expected: [],
    warning: "complex plural selectors",
  },
])(
  "General Translation setup leaves out locales that may lose forms of $name",
  async ({
    baseLocale,
    locales,
    declarations,
    selectors,
    match,
    expected,
    warning,
  }) => {
    await mkdir(join(root, "project.inlang"));
    await mkdir(join(root, "messages"));
    await writeFile(
      join(root, "project.inlang/settings.json"),
      JSON.stringify({
        baseLocale,
        locales,
        modules: defaults.getNewProjectTemplate().modules,
        "plugin.inlang.messageFormat": {
          pathPattern: "./messages/{locale}.json",
        },
      })
    );
    await writeFile(
      join(root, `messages/${baseLocale}.json`),
      JSON.stringify({
        place: [
          {
            declarations: ["input place", ...declarations],
            selectors: selectors ?? ["placePlural"],
            match,
          },
        ],
      })
    );

    const warn = vi.spyOn(Logger.prototype, "warn");
    const info = vi.spyOn(Logger.prototype, "info");
    await runInit({ yes: true, compile: false, translation: "gt" });

    if (expected.length === 0) {
      expect(await readdir(root)).not.toContain("gt.config.json");
      const pkg = JSON.parse(
        await readFile(join(root, "package.json"), "utf8")
      );
      expect(pkg.devDependencies?.gt).toBeUndefined();
      expect(pkg.scripts?.translate).toBeUndefined();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("Skipped General Translation setup")
      );
      if (warning)
        expect(warn).toHaveBeenCalledWith(expect.stringContaining(warning));
      expect(info).not.toHaveBeenCalledWith(
        expect.stringContaining("--dev-credentials")
      );
    } else {
      const config = JSON.parse(
        await readFile(join(root, "gt.config.json"), "utf8")
      );
      expect(config.locales).toEqual(expected);
    }
  }
);

test("explicit paths and ESLint setup work without prompts", async () => {
  await writeFile(
    join(root, "eslint.config.mjs"),
    "// preserve existing config"
  );
  await runInit({
    yes: true,
    project: "./config/project.inlang",
    outdir: "./src/i18n",
    lint: "eslint",
    check: false,
    compile: false,
  });
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  expect(pkg.scripts["check:i18n"]).toBeUndefined();
  expect(pkg.scripts["lint:i18n"]).toContain("eslint.paraglide.config.mjs");
  expect(await readFile(join(root, "eslint.config.mjs"), "utf8")).toBe(
    "// preserve existing config"
  );
  const settings = JSON.parse(
    await readFile(join(root, "config/project.inlang/settings.json"), "utf8")
  );
  expect(settings["plugin.inlang.messageFormat"].pathPattern).toBe(
    "../messages/{locale}.json"
  );
  expect(pkg.scripts.build).toContain("./config/project.inlang");
  expect(pkg.scripts.build).toContain("./src/i18n");
  expect(pkg.scripts.build).toContain("--emit-ts-declarations");
});

test("closed input without an unattended flag fails before writes", async () => {
  await expect(runInit({})).rejects.toThrow("Use --yes");
  expect(await readdir(root)).toEqual(["package.json"]);
});

test("unwritable integration and invalid paths fail before scaffolding", async () => {
  await writeFile(
    join(root, "vite.config.ts"),
    "export default () => ({plugins:getPlugins()});"
  );
  await expect(runInit({ yes: true })).rejects.toThrow(
    "Vite configuration cannot"
  );
  expect((await readdir(root)).sort()).toEqual([
    "package.json",
    "vite.config.ts",
  ]);
  await expect(runInit({ yes: true, outdir: "." })).rejects.toThrow("distinct");
});

test("CLI help exposes unattended mode and optional lint choices", () => {
  const help = createInitCommand().helpInformation();
  for (const flag of [
    "--yes",
    "--non-interactive",
    "--outdir",
    "--project",
    "--lint",
    "--allow-dirty",
    "--no-compile",
  ])
    expect(help).toContain(flag);
});

test("dirty git trees require explicit permission without prompting", async () => {
  await promisify(execFile)("git", ["init", root]);
  const ctx = {
    logger: new Logger({ silent: true, prefix: false }),
    root,
    interactive: false,
  };
  await expect(checkForUncommittedChanges(ctx)).rejects.toThrow(
    "--allow-dirty"
  );
  await expect(
    checkForUncommittedChanges({ ...ctx, allowDirty: true })
  ).resolves.toBeDefined();
  expect(utils.prompt).not.toHaveBeenCalled();
});

test("invalid lint choices fail before creating files", async () => {
  const command = createInitCommand().exitOverride();
  await expect(
    command.parseAsync(["--yes", "--lint", "invalid"], { from: "user" })
  ).rejects.toThrow("Allowed choices");
  expect(await readdir(root)).toEqual(["package.json"]);
});

test("init emits declarations without requiring or editing a tsconfig", async () => {
  const tsconfig =
    '{ "compilerOptions": { "allowJs": false, "strict": true } }';
  await writeFile(join(root, "tsconfig.json"), tsconfig);
  await runInit({ yes: true });
  expect(await readFile(join(root, "tsconfig.json"), "utf8")).toBe(tsconfig);
  expect(
    await readFile(join(root, "src/paraglide/messages.d.ts"), "utf8")
  ).toContain("export");
  expect(
    await readFile(join(root, "src/paraglide/runtime.d.ts"), "utf8")
  ).toContain("getLocale");
});
