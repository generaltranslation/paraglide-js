import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { memfs } from "memfs";
import { Logger } from "../../services/logger/index.js";
import * as utils from "../utils.js";
import { maybeAddMachineTranslation } from "./maybe-add-machine-translation.js";

const originalCwd = process.cwd;
const savedEnv = { ...process.env };
beforeEach(() => {
  process.cwd = (() => "/") as typeof process.cwd;
  // The developer's own shell may choose a provider.
  for (const name of Object.keys(process.env))
    if (/INLANG_|GT_/.test(name)) delete process.env[name];
  vi.spyOn(utils, "prompt").mockImplementation(async () => {
    throw new Error("Unexpected confirm");
  });
  vi.spyOn(utils, "promptSelection").mockImplementation(async () => {
    throw new Error("Unexpected select");
  });
});
afterEach(() => {
  process.cwd = originalCwd;
  process.env = { ...savedEnv };
  vi.restoreAllMocks();
});

async function run(
  options: {
    files?: Record<string, string>;
    interactive?: boolean;
    machineTranslation?: boolean | "gt";
  } = {}
) {
  const { fs } = memfs({
    "/package.json": JSON.stringify({ scripts: { build: "vite build" } }),
    ...options.files,
  });
  const logger = new Logger({ silent: true, prefix: false });
  const success = vi.spyOn(logger, "success");
  const info = vi.spyOn(logger, "info");
  const warn = vi.spyOn(logger, "warn");
  const result = await maybeAddMachineTranslation({
    fs: fs.promises as unknown as typeof import("node:fs/promises"),
    logger,
    projectPath: "./project.inlang",
    root: "/",
    packageJsonPath: "/package.json",
    interactive: options.interactive ?? true,
    machineTranslation: options.machineTranslation,
  });
  const read = (file: string) =>
    fs.promises
      .readFile(file, "utf8")
      .then(String)
      .catch(() => undefined);
  return {
    setup: result.machineTranslationSetup,
    pkg: JSON.parse((await read("/package.json"))!),
    envLocal: await read("/.env.local"),
    gitignore: await read("/.gitignore"),
    logged: success.mock.calls.map(([message]) => message),
    informed: info.mock.calls.map(([message]) => message),
    warned: warn.mock.calls.map(([message]) => String(message)),
  };
}

test("asks which provider to use, with General Translation first and recommended", async () => {
  vi.mocked(utils.promptSelection).mockResolvedValueOnce("gt");
  await run();
  const [question, options] = vi.mocked(utils.promptSelection).mock.calls[0]!;
  expect(question).toBe("Which translation provider should this project use?");
  expect(options?.initial).toBe("gt");
  expect(options?.options.map((option) => option.label)).toEqual([
    "General Translation (recommended)",
    "Another provider",
    "Skip",
  ]);
});

test("choosing General Translation adds the script and saves the choice to .env.local", async () => {
  vi.mocked(utils.promptSelection).mockResolvedValueOnce("gt");
  const { setup, pkg, envLocal, gitignore, logged } = await run({
    files: { "/.env.local": "OTHER=1" },
  });
  expect(setup).toBe("gt");
  expect(pkg.devDependencies).toEqual({ "@inlang/cli": "^3.7.1" });
  expect(pkg.scripts["machine-translate"]).toBe(
    "inlang machine translate --project project.inlang"
  );
  expect(envLocal).toBe("OTHER=1\nINLANG_MACHINE_TRANSLATE_PROVIDER=gt\n");
  expect(gitignore).toBe(".env.local\n");
  expect(logged).toEqual([
    "Added @inlang/cli ^3.7.1 to the devDependencies in package.json.",
    "Added a machine-translate script to package.json.",
    "Chose General Translation for machine translation in .env.local. To choose another provider, remove INLANG_MACHINE_TRANSLATE_PROVIDER from it.",
    "Added .env.local to .gitignore.",
  ]);
});

test("another provider adds only the script, and the inlang CLI asks on its first run", async () => {
  vi.mocked(utils.promptSelection).mockResolvedValueOnce("script");
  const { setup, pkg, envLocal } = await run();
  expect(setup).toBe("script");
  expect(pkg.scripts["machine-translate"]).toBeDefined();
  expect(envLocal).toBeUndefined();
});

test("skip changes nothing", async () => {
  vi.mocked(utils.promptSelection).mockResolvedValueOnce("none");
  const { setup, pkg, envLocal } = await run();
  expect(setup).toBe("none");
  expect(pkg).toEqual({ scripts: { build: "vite build" } });
  expect(envLocal).toBeUndefined();
});

test.each([
  [
    "a provider in .env",
    { "/.env": "INLANG_MACHINE_TRANSLATE_PROVIDER=deepl" },
  ],
  ["a DeepL key in .env.local", { "/.env.local": "INLANG_DEEPL_API_KEY='k'" }],
  ["a General Translation key", { "/.env.local": "VITE_GT_DEV_API_KEY=k" }],
  [
    "a project ID in gt.config.json",
    { "/gt.config.json": '{"projectId":"p"}' },
  ],
])(
  "a project that chose a provider with %s is only asked about the script",
  async (_, files) => {
    vi.mocked(utils.prompt).mockResolvedValueOnce(true as never);
    const { setup, envLocal } = await run({ files });
    expect(utils.promptSelection).not.toHaveBeenCalled();
    expect(vi.mocked(utils.prompt).mock.calls[0]![0]).toBe(
      "Add a machine-translate script?"
    );
    expect(setup).toBe("script");
    expect(envLocal).toBe(files["/.env.local" as keyof typeof files]);
  }
);

test("a project that chose a provider and has the script isn't asked again", async () => {
  const { setup, logged } = await run({
    files: {
      "/package.json": JSON.stringify({
        scripts: { "machine-translate": "inlang machine translate" },
        devDependencies: { "@inlang/cli": "^3.7.1" },
      }),
      "/.env.local": "INLANG_MACHINE_TRANSLATE_PROVIDER=gt\n",
    },
  });
  expect(utils.prompt).not.toHaveBeenCalled();
  expect(utils.promptSelection).not.toHaveBeenCalled();
  expect(setup).toBe("script");
  expect(logged).toEqual([]);
});

test("a provider chosen in the shell counts too", async () => {
  process.env.GT_API_KEY = "k";
  vi.mocked(utils.prompt).mockResolvedValueOnce(false as never);
  const { setup } = await run();
  expect(utils.promptSelection).not.toHaveBeenCalled();
  expect(setup).toBe("none");
});

test("without a terminal, nothing is set up unless a flag asks", async () => {
  expect((await run({ interactive: false })).setup).toBe("none");
  const script = await run({ interactive: false, machineTranslation: true });
  expect(script.setup).toBe("script");
  expect(script.envLocal).toBeUndefined();
  const gt = await run({ interactive: false, machineTranslation: "gt" });
  expect(gt.setup).toBe("gt");
  expect(gt.envLocal).toBe("INLANG_MACHINE_TRANSLATE_PROVIDER=gt\n");
  expect(utils.prompt).not.toHaveBeenCalled();
  expect(utils.promptSelection).not.toHaveBeenCalled();
});

test("--machine-translation gt doesn't override a provider the project chose", async () => {
  const { setup, envLocal } = await run({
    interactive: false,
    machineTranslation: "gt",
    files: { "/.env.local": "INLANG_MACHINE_TRANSLATE_PROVIDER=demosjarco\n" },
  });
  expect(setup).toBe("script");
  expect(envLocal).toBe("INLANG_MACHINE_TRANSLATE_PROVIDER=demosjarco\n");
});

test("warns about an existing @inlang/cli before 3.7 only for General Translation", async () => {
  const files = {
    "/package.json": JSON.stringify({
      devDependencies: { "@inlang/cli": "^3.4.0" },
    }),
  };
  vi.mocked(utils.promptSelection).mockResolvedValueOnce("gt");
  const gt = await run({ files });
  expect(gt.pkg.devDependencies["@inlang/cli"]).toBe("^3.4.0");
  expect(gt.warned).toEqual([
    'General Translation needs @inlang/cli 3.7.0 or later. Your package.json has "^3.4.0". Update it to "^3.7.1".',
  ]);
  vi.mocked(utils.promptSelection).mockResolvedValueOnce("script");
  expect((await run({ files })).warned).toEqual([]);
});

test("an unreadable .env.local doesn't fail init when it needn't be read", async () => {
  const files = { "/.env.local/not-a-file": "" };
  expect((await run({ files, interactive: false })).setup).toBe("none");
});

test("an unreadable .env.local leaves the provider to the inlang CLI", async () => {
  vi.mocked(utils.prompt).mockResolvedValueOnce(true as never);
  const { setup } = await run({ files: { "/.env.local/not-a-file": "" } });
  expect(utils.promptSelection).not.toHaveBeenCalled();
  expect(setup).toBe("script");
});

test("a machine-translate script that doesn't run the inlang CLI is kept, without a provider", async () => {
  const pkg = { scripts: { "machine-translate": "my-translator --all" } };
  const files = { "/package.json": JSON.stringify(pkg) };
  for (const options of [
    {},
    { machineTranslation: "gt" as const },
    { interactive: false, machineTranslation: true },
  ]) {
    const result = await run({ files, ...options });
    expect(result.setup).toBe("none");
    expect(result.pkg).toEqual(pkg);
    expect(result.envLocal).toBeUndefined();
    expect(result.informed).toEqual([
      "Kept the machine-translate script in package.json, which doesn't run the inlang CLI.",
    ]);
  }
  expect(utils.prompt).not.toHaveBeenCalled();
  expect(utils.promptSelection).not.toHaveBeenCalled();
});
