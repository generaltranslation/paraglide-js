import { describe, expect, test } from "vitest";
import fs from "node:fs";

describe("supporting declaration templates", () => {
  test("templates cannot shadow implementation JavaScript during type checking", () => {
    for (const name of ["runtime", "server", "registry", "routing-index"]) {
      expect(
        fs.existsSync(new URL(`./declarations/${name}.d.ts`, import.meta.url))
      ).toBe(false);
      expect(
        fs.existsSync(
          new URL(`./declarations/${name}.d.ts.template`, import.meta.url)
        )
      ).toBe(true);
    }
  });
});

test.each([
  ["import.meta.env?.SSR ?? typeof window === 'undefined'", "boolean"],
  ["true", "true"],
  ["false", "false"],
  ["typeof window === 'undefined'", "boolean"],
  ["customServerFlag()", "any"],
])("preserves declaration type for %s (#883)", async (isServer, expected) => {
  const { emitSupportingDeclarations } =
    await import("./emit-supporting-declarations.js");
  const declarations = emitSupportingDeclarations({
    baseLocale: "en",
    locales: ["en", "de"],
    compilerOptions: { isServer },
  });
  expect(
    declarations["runtime.d.ts"]?.match(/export const isServer[^\n]*/)?.[0]
  ).toBe(`export const isServer: ${expected};`);
});
