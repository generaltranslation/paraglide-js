import { afterEach, beforeEach, expect, test } from "vitest";
import * as fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { Logger } from "../../services/logger/index.js";
import { maybeAddMachineTranslation } from "./maybe-add-machine-translation.js";

const savedEnv = { ...process.env };
beforeEach(() => {
  for (const name of Object.keys(process.env))
    if (/INLANG_|GT_/.test(name)) delete process.env[name];
});
afterEach(() => {
  process.env = { ...savedEnv };
});

test.each([
  ["existing wildcard", "*.local\n", "*.local\n"],
  ["new rule", "dist\n", "dist\n.env.local\n"],
])("GT setup respects a real Git worktree: %s", async (_, before, after) => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "paraglide-init-"));
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" });
  try {
    git("init", "--quiet", "--template=");
    git("config", "core.excludesFile", path.join(root, "no-global-ignore"));
    const packageJsonPath = path.join(root, "package.json");
    await fs.writeFile(packageJsonPath, "{}");
    await fs.writeFile(path.join(root, ".gitignore"), before);
    const result = await maybeAddMachineTranslation({
      fs,
      logger: new Logger({ silent: true, prefix: false }),
      root,
      packageJsonPath,
      projectPath: path.join(root, "project.inlang"),
      interactive: false,
      machineTranslation: "gt",
    });
    expect(result.machineTranslationProvider).toBe("gt");
    expect(await fs.readFile(path.join(root, ".gitignore"), "utf8")).toBe(
      after
    );
    expect(await fs.readFile(path.join(root, ".env.local"), "utf8")).toBe(
      "INLANG_MACHINE_TRANSLATE_PROVIDER=gt\n"
    );
    expect(git("check-ignore", "--", ".env.local").trim()).toBe(".env.local");
    expect(
      git("ls-files", "--others", "--exclude-standard").split("\n")
    ).not.toContain(".env.local");
    if (process.platform !== "win32")
      expect((await fs.stat(path.join(root, ".env.local"))).mode & 0o777).toBe(
        0o600
      );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
