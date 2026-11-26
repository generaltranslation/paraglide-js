import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { memfs } from "memfs";
import { Logger } from "../../services/logger/index.js";
import * as utils from "../utils.js";
import { maybeAddMachineTranslation } from "./maybe-add-machine-translation.js";

const git = vi.hoisted(() => ({ ignored: 1, tracked: false }));
vi.mock("node:child_process", () => ({
  execFile: (
    _file: string,
    args: string[],
    _options: object,
    callback: (error: { code: number } | null) => void
  ) => {
    const code = args[0] === "ls-files" ? (git.tracked ? 0 : 1) : git.ignored;
    callback(code === 0 ? null : { code });
  },
}));

const savedEnv = { ...process.env };
beforeEach(() => {
  vi.spyOn(process, "cwd").mockReturnValue("/");
  git.ignored = 1;
  git.tracked = false;
  for (const name of Object.keys(process.env))
    if (/INLANG_|GT_/.test(name)) delete process.env[name];
  vi.spyOn(utils, "prompt").mockRejectedValue(new Error("Unexpected confirm"));
  vi.spyOn(utils, "promptSelection").mockRejectedValue(
    new Error("Unexpected select")
  );
});
afterEach(() => {
  process.env = { ...savedEnv };
  vi.restoreAllMocks();
});

const packageFile = (pkg: object) => ({ "/package.json": JSON.stringify(pkg) });
const chooseInteractively = {
  interactive: true,
  machineTranslation: undefined,
};
async function run({
  files = {},
  prepare,
  ...options
}: {
  files?: Record<string, string>;
  interactive?: boolean;
  projectPath?: string;
  machineTranslation?: boolean | "gt";
  prepare?: (fs: ReturnType<typeof memfs>["fs"]) => void;
} = {}) {
  const { fs } = memfs({
    ...packageFile({ scripts: { build: "vite build" } }),
    ...files,
  });
  prepare?.(fs);
  const logger = new Logger({ silent: true, prefix: false });
  const info = vi.spyOn(logger, "info");
  const warn = vi.spyOn(logger, "warn");
  const result = await maybeAddMachineTranslation({
    fs: fs.promises as unknown as typeof import("node:fs/promises"),
    logger,
    projectPath: "./project.inlang",
    root: "/",
    packageJsonPath: "/package.json",
    interactive: false,
    machineTranslation: "gt",
    ...options,
  });
  const read = (file: string) =>
    fs.promises
      .readFile(file, "utf8")
      .then(String)
      .catch(() => undefined);
  return {
    provider: result.machineTranslationProvider,
    pkg: JSON.parse((await read("/package.json"))!),
    envLocal: await read("/.env.local"),
    gitignore: await read("/.gitignore"),
    informed: info.mock.calls.map(([message]) => String(message)),
    warned: warn.mock.calls.map(([message]) => String(message)),
    read,
  };
}

test("offers GT first and saves the choice without replacing existing settings", async () => {
  vi.mocked(utils.promptSelection).mockResolvedValueOnce("gt");
  const result = await run({
    ...chooseInteractively,
    files: { "/.env.local": "OTHER=1" },
  });
  const [question, options] = vi.mocked(utils.promptSelection).mock.calls[0]!;
  expect(question).toBe("Which translation provider should this project use?");
  expect(options?.initial).toBe("gt");
  expect(options?.options.map(({ label }) => label)).toEqual([
    "General Translation (recommended)",
    "Another provider",
    "Skip",
  ]);
  expect(result.provider).toBe("gt");
  expect(result.pkg).toEqual({
    scripts: {
      build: "vite build",
      "machine-translate": "inlang machine translate --project project.inlang",
    },
    devDependencies: { "@inlang/cli": "^3.7.1" },
  });
  expect(result.envLocal).toBe(
    "OTHER=1\nINLANG_MACHINE_TRANSLATE_PROVIDER=gt\n"
  );
  expect(result.gitignore).toBe(".env.local\n");
});

test.each([
  ["script", "unchosen"],
  ["none", undefined],
] as const)(
  "menu choice %s leaves provider configuration untouched",
  async (choice, provider) => {
    vi.mocked(utils.promptSelection).mockResolvedValueOnce(choice);
    const result = await run(chooseInteractively);
    expect(result.provider).toBe(provider);
    expect(Boolean(result.pkg.scripts["machine-translate"])).toBe(
      choice === "script"
    );
    expect(result.envLocal).toBeUndefined();
    expect(result.gitignore).toBeUndefined();
    if (choice === "none")
      expect(result.pkg).toEqual({ scripts: { build: "vite build" } });
  }
);

test.each([
  [undefined, undefined],
  [false, undefined],
  [true, "unchosen"],
  ["gt", "gt"],
] as const)(
  "noninteractive flag %s produces provider %s without prompting",
  async (machineTranslation, provider) => {
    const result = await run({ machineTranslation });
    expect(result.provider).toBe(provider);
    expect(Boolean(result.pkg.scripts["machine-translate"])).toBe(
      provider !== undefined
    );
    expect(result.envLocal).toBe(
      provider === "gt" ? "INLANG_MACHINE_TRANSLATE_PROVIDER=gt\n" : undefined
    );
    expect(utils.prompt).not.toHaveBeenCalled();
    expect(utils.promptSelection).not.toHaveBeenCalled();
  }
);

test.each([
  [
    ".env selector",
    { "/.env": "INLANG_MACHINE_TRANSLATE_PROVIDER=deepl" },
    "other",
  ],
  ["DeepL key", { "/.env.local": "INLANG_DEEPL_API_KEY='k'" }, "other"],
  ["GT key", { "/.env.local": "VITE_GT_DEV_API_KEY=k" }, "gt"],
  ["GT project", { "/gt.config.json": '{"projectId":"p"}' }, "gt"],
] as const)(
  "existing %s only prompts to add the script",
  async (_, files, provider) => {
    vi.mocked(utils.prompt).mockResolvedValueOnce(true as never);
    const result = await run({ ...chooseInteractively, files });
    expect(utils.promptSelection).not.toHaveBeenCalled();
    expect(utils.prompt).toHaveBeenCalledWith(
      expect.stringContaining("machine-translate"),
      expect.anything()
    );
    expect(result.provider).toBe(provider);
    expect(result.envLocal).toBe(files["/.env.local" as keyof typeof files]);
  }
);

test("an existing GT setup is preserved without another prompt", async () => {
  const pkg = {
    scripts: {
      "machine-translate":
        "inlang machine translate --project ./project.inlang",
    },
    devDependencies: { "@inlang/cli": "^3.7.1" },
  };
  const result = await run({
    ...chooseInteractively,
    files: {
      ...packageFile(pkg),
      "/.env.local": "INLANG_MACHINE_TRANSLATE_PROVIDER=gt\n",
    },
  });
  expect(result.provider).toBe("gt");
  expect(result.pkg).toEqual(pkg);
  expect(utils.prompt).not.toHaveBeenCalled();
  expect(utils.promptSelection).not.toHaveBeenCalled();
});

test("a shell provider can decline adding the script", async () => {
  process.env.GT_API_KEY = "k";
  vi.mocked(utils.prompt).mockResolvedValueOnce(false as never);
  expect((await run(chooseInteractively)).provider).toBeUndefined();
  expect(utils.promptSelection).not.toHaveBeenCalled();
});

test.each([
  [
    "provider flag",
    "INLANG_MACHINE_TRANSLATE_PROVIDER=demosjarco\n",
    {},
    "other",
  ],
  [
    "blank shell selector",
    "INLANG_MACHINE_TRANSLATE_PROVIDER=demosjarco\n",
    { INLANG_MACHINE_TRANSLATE_PROVIDER: " " },
    "other",
  ],
  [
    "shell selector precedence",
    "INLANG_MACHINE_TRANSLATE_PROVIDER=deepl\n",
    { INLANG_MACHINE_TRANSLATE_PROVIDER: "gt" },
    "gt",
  ],
  [
    "case-insensitive selector",
    "INLANG_MACHINE_TRANSLATE_PROVIDER=GT\n",
    {},
    "gt",
  ],
  [
    "dotenv colon syntax",
    "INLANG_MACHINE_TRANSLATE_PROVIDER: demosjarco\n",
    {},
    "other",
  ],
  ["dotenv backticks", "INLANG_MACHINE_TRANSLATE_PROVIDER=`gt`\n", {}, "gt"],
] as const)(
  "preserves the CLI's provider resolution: %s",
  async (_, text, shell, provider) => {
    Object.assign(process.env, shell);
    const result = await run({ files: { "/.env.local": text } });
    expect(result.provider).toBe(provider);
    expect(result.envLocal).toBe(text);
  }
);

test.each(["shell", ".env.local"])(
  "a blank key in %s overrides the key in .env",
  async (source) => {
    const files: Record<string, string> = {
      "/.env": "INLANG_DEEPL_API_KEY=k\n",
    };
    if (source === "shell") process.env.INLANG_DEEPL_API_KEY = "";
    else files["/.env.local"] = "INLANG_DEEPL_API_KEY=\n";
    const result = await run({ files });
    expect(result.provider).toBe("gt");
    expect(result.envLocal).toContain("INLANG_MACHINE_TRANSLATE_PROVIDER=gt\n");
  }
);

test.each([
  [".env.local", { "/.env.local/not-a-file": "" }],
  ["gt.config.json", { "/gt.config.json": "{" }],
] as const)(
  "unreadable %s preserves configuration and reports an unknown provider",
  async (file, files) => {
    const result = await run({ files });
    expect(result.provider).toBe("unknown");
    expect(result.envLocal).toBeUndefined();
    expect(result.warned).toEqual([expect.stringContaining(file)]);
    expect(
      (await run({ files, machineTranslation: undefined })).provider
    ).toBeUndefined();
  }
);

test.each([
  "my-translator --all",
  "inlang\nmachine translate --project ./project.inlang",
  "inlang machine translate",
  "INLANG_MACHINE_TRANSLATE_PROVIDER=deepl inlang machine translate --project ./project.inlang",
  "inlang machine translate --project config/project.inlang",
  "npx @inlang/cli@latest machine translate --project ./other.inlang",
])(
  "unmanaged script %s leaves dependencies and provider alone",
  async (script) => {
    const pkg = { scripts: { "machine-translate": script } };
    for (const machineTranslation of [undefined, "gt", true] as const) {
      const result = await run({
        interactive: true,
        machineTranslation,
        files: packageFile(pkg),
      });
      expect(result.provider).toBeUndefined();
      expect(result.pkg).toEqual(pkg);
      expect(result.envLocal).toBeUndefined();
      expect(result.gitignore).toBeUndefined();
    }
    expect(utils.prompt).not.toHaveBeenCalled();
    expect(utils.promptSelection).not.toHaveBeenCalled();
  }
);

test.each([
  'inlang machine translate --project="./project.inlang"',
  "inlang machine translate --project project.inlang",
  "npx @inlang/cli@latest machine translate --project ./project.inlang",
  "npx --yes @inlang/cli@3.7.1 machine translate --project '/project.inlang'",
  "npx -y @inlang/cli machine translate --project=./project.inlang",
])("preserves supported script %s", async (script) => {
  const result = await run({
    files: packageFile({ scripts: { "machine-translate": script } }),
  });
  expect(result.provider).toBe("gt");
  expect(result.pkg.scripts["machine-translate"]).toBe(script);
  expect(result.envLocal).toBe("INLANG_MACHINE_TRANSLATE_PROVIDER=gt\n");
});

test.each([
  ["dependency", { devDependencies: { "@inlang/cli": "^3.4.0" } }, {}],
  [
    "runtime dependency",
    { dependencies: { "@inlang/cli": "3.4.0" }, devDependencies: undefined },
    {},
  ],
  [
    "existing GT",
    { devDependencies: { "@inlang/cli": "3.4.0" } },
    { "/gt.config.json": '{"projectId":"p"}' },
  ],
  [
    "pinned npx",
    {
      scripts: {
        "machine-translate":
          "npx @inlang/cli@3.4.0 machine translate --project ./project.inlang",
      },
      devDependencies: { "@inlang/cli": "^3.7.1" },
    },
    {},
  ],
] as const)(
  "warns about old CLI in %s without replacing it",
  async (_, pkg, files) => {
    const result = await run({ files: { ...files, ...packageFile(pkg) } });
    expect(result.provider).toBe("gt");
    expect(result.pkg.devDependencies).toEqual(pkg.devDependencies);
    expect(result.pkg.dependencies).toEqual(
      "dependencies" in pkg ? pkg.dependencies : undefined
    );
    expect(result.warned).toEqual([expect.stringContaining("3.4.0")]);
    expect(result.warned[0]).toContain("3.7.0");
  }
);

test("other providers don't get GT version warnings", async () => {
  const result = await run({
    files: {
      ...packageFile({ devDependencies: { "@inlang/cli": "^3.4.0" } }),
      "/.env": "INLANG_DEEPL_API_KEY=k\n",
    },
  });
  expect(result.provider).toBe("other");
  expect(result.warned).toEqual([]);
  expect(result.informed.join(" ")).toMatch(/kept/i);
});

test.each([
  ["outside Git", 128],
  ["already ignored", 0],
])("%s leaves .gitignore alone", async (_, exitCode) => {
  git.ignored = exitCode as number;
  const result = await run({ files: { "/.gitignore": "*.local\n" } });
  expect(result.gitignore).toBe("*.local\n");
  expect(result.envLocal).toBe("INLANG_MACHINE_TRANSLATE_PROVIDER=gt\n");
});

test("a symlinked .gitignore is preserved with an actionable warning", async () => {
  const result = await run({
    files: { "/shared/ignore": "dist\n" },
    prepare: (fs) => fs.symlinkSync("/shared/ignore", "/.gitignore"),
  });
  expect(await result.read("/shared/ignore")).toBe("dist\n");
  expect(result.provider).toBe("gt");
  expect(result.envLocal).toBe("INLANG_MACHINE_TRANSLATE_PROVIDER=gt\n");
  expect(result.warned).toEqual([
    expect.stringMatching(/\.gitignore.*symbolic link/),
  ]);
});

test.each(["symlink", "tracked", "write failure"])(
  "%s prevents saving the provider, with a warning",
  async (reason) => {
    git.tracked = reason === "tracked";
    const result = await run({
      files:
        reason === "symlink"
          ? { "/shared/.env": "OTHER=1\n" }
          : { "/.env.local": "OTHER=1\n" },
      prepare: (fs) => {
        if (reason === "symlink") fs.symlinkSync("/shared/.env", "/.env.local");
        if (reason === "write failure") fs.mkdirSync("/.gitignore");
      },
    });
    expect(result.provider).toBe("unchosen");
    expect(result.pkg.scripts["machine-translate"]).toBeDefined();
    expect(result.envLocal).toBe("OTHER=1\n");
    expect(result.warned).toHaveLength(1);
    expect(result.warned[0]).toContain(".env.local");
    if (reason === "symlink")
      expect(await result.read("/shared/.env")).toBe("OTHER=1\n");
    if (reason === "tracked") expect(result.gitignore).toBeUndefined();
  }
);

test.each([
  ["added", undefined, "my-translator"],
  [
    "changed",
    "inlang machine translate --project ./project.inlang",
    "inlang machine translate --project other.inlang",
  ],
] as const)(
  "a script %s during the menu is revalidated before any setup writes",
  async (_, original, replacement) => {
    const pkg = { scripts: { "machine-translate": replacement } };
    let changeScript = () => {};
    vi.mocked(utils.promptSelection).mockImplementationOnce(async () => {
      changeScript();
      return "gt";
    });
    const result = await run({
      ...chooseInteractively,
      files: packageFile({
        scripts: original ? { "machine-translate": original } : {},
      }),
      prepare: (fs) => {
        changeScript = () =>
          fs.writeFileSync("/package.json", JSON.stringify(pkg));
      },
    });
    expect(result.provider).toBeUndefined();
    expect(result.pkg).toEqual(pkg);
    expect(result.envLocal).toBeUndefined();
    expect(result.gitignore).toBeUndefined();
  }
);

test("a provider chosen during the menu is preserved", async () => {
  const choice = "INLANG_MACHINE_TRANSLATE_PROVIDER=deepl\n";
  let chooseProvider = () => {};
  vi.mocked(utils.promptSelection).mockImplementationOnce(async () => {
    chooseProvider();
    return "gt";
  });
  const result = await run({
    ...chooseInteractively,
    prepare: (fs) => {
      chooseProvider = () => fs.writeFileSync("/.env.local", choice);
    },
  });
  expect(result.provider).toBe("other");
  expect(result.envLocal).toBe(choice);
  expect(result.gitignore).toBeUndefined();
});

test("a generated command with spaces, apostrophes and dollar signs survives a rerun", async () => {
  const projectPath = "/project with space's $value.inlang";
  const initial = await run({ projectPath });
  expect(initial.provider).toBe("gt");
  const rerun = await run({
    ...chooseInteractively,
    projectPath,
    files: { ...packageFile(initial.pkg), "/.env.local": initial.envLocal! },
  });
  expect(rerun.provider).toBe("gt");
  expect(rerun.pkg).toEqual(initial.pkg);
  expect(rerun.envLocal).toBe(initial.envLocal);
  expect(utils.prompt).not.toHaveBeenCalled();
  expect(utils.promptSelection).not.toHaveBeenCalled();
});
