import { test, expect, vi, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { Logger } from "../../services/logger/index.js";
import * as utils from "../utils.js";
import { maybeRunGeneralTranslation } from "./maybe-add-translation.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function exitWith(...codes: number[]) {
  for (const code of codes) {
    vi.mocked(spawn).mockImplementationOnce(() => {
      const child = new EventEmitter();
      setTimeout(() => child.emit("close", code));
      return child as ReturnType<typeof spawn>;
    });
  }
}

test("accepting the offer signs in, then translates", async () => {
  vi.spyOn(utils, "prompt").mockResolvedValue(true as never);
  exitWith(0, 0);
  const logger = new Logger({ silent: true, prefix: false });
  const success = vi.spyOn(logger, "success");
  await maybeRunGeneralTranslation({ logger, root: "/app", interactive: true });
  expect(vi.mocked(spawn).mock.calls.map((call) => call[1]?.slice(2))).toEqual([
    ["init", "--no-react-setup", "--dev-credentials"],
    ["translate"],
  ]);
  expect(success).toHaveBeenCalledWith(
    expect.stringContaining("Translated your messages")
  );
});

test("a failed sign-in stops before translating and prints the commands", async () => {
  vi.spyOn(utils, "prompt").mockResolvedValue(true as never);
  exitWith(1);
  const logger = new Logger({ silent: true, prefix: false });
  const warn = vi.spyOn(logger, "warn");
  await maybeRunGeneralTranslation({ logger, root: "/app", interactive: true });
  expect(spawn).toHaveBeenCalledTimes(1);
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining("npx gt init --no-react-setup --dev-credentials")
  );
});

test("declining to translate after gt init exits, as on a cancel, skips translation", async () => {
  vi.spyOn(utils, "prompt")
    .mockResolvedValueOnce(true as never)
    .mockResolvedValueOnce(false as never);
  exitWith(0);
  const logger = new Logger({ silent: true, prefix: false });
  const info = vi.spyOn(logger, "info");
  await maybeRunGeneralTranslation({ logger, root: "/app", interactive: true });
  expect(spawn).toHaveBeenCalledTimes(1);
  expect(info).toHaveBeenCalledWith(
    expect.stringContaining("To translate later, run `npx gt translate`")
  );
});
