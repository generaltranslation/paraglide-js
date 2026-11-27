import { newProject } from "@inlang/sdk";
import { expect, test } from "vitest";
import { createParaglide } from "../create-paraglide.js";

test("returns the preferred locale from navigator.languages", async () => {
  const originalNavigator = globalThis.navigator;

  const runtime = await createParaglide({
    blob: await newProject({
      settings: {
        baseLocale: "en",
        locales: ["en", "fr", "de"],
      },
    }),
    isServer: "false",
    strategy: ["preferredLanguage"],
  });

  // Mock navigator.languages
  Object.defineProperty(globalThis, "navigator", {
    value: {
      languages: ["fr-FR", "en-US", "de"],
    },
    configurable: true,
  });

  expect(runtime.getLocale()).toBe("fr");

  // Restore original navigator
  Object.defineProperty(globalThis, "navigator", {
    value: originalNavigator,
    configurable: true,
  });
});

test("canonicalizes navigator locale casing", async () => {
  const originalNavigator = globalThis.navigator;

  const runtime = await createParaglide({
    blob: await newProject({
      settings: {
        baseLocale: "en",
        locales: ["en", "pt-BR"],
      },
    }),
    isServer: "false",
    strategy: ["preferredLanguage"],
  });

  Object.defineProperty(globalThis, "navigator", {
    value: {
      languages: ["pt-br", "en-US"],
    },
    configurable: true,
  });

  expect(runtime.getLocale()).toBe("pt-BR");

  Object.defineProperty(globalThis, "navigator", {
    value: originalNavigator,
    configurable: true,
  });
});

test("truncates navigator languages one subtag at a time", async () => {
  const originalNavigator = globalThis.navigator;

  const runtime = await createParaglide({
    blob: await newProject({
      settings: {
        baseLocale: "en",
        locales: ["en", "zh", "zh-Hant"],
      },
    }),
    isServer: "false",
    strategy: ["preferredLanguage"],
  });

  Object.defineProperty(globalThis, "navigator", {
    value: {
      languages: ["zh-Hant-TW", "en-US"],
    },
    configurable: true,
  });

  expect(runtime.getLocale()).toBe("zh-Hant");

  Object.defineProperty(globalThis, "navigator", {
    value: originalNavigator,
    configurable: true,
  });
});
