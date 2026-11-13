import { expect, test } from "vitest";
import {
  GT_MESSAGE_TEXT_JSONPATH,
  generalTranslationConfig,
  localesNeedingExtraPluralForms,
} from "./maybe-add-translation.js";

test("the General Translation config translates message files in place without their variant structure", () => {
  expect(
    generalTranslationConfig({
      baseLocale: "en",
      locales: ["en", "de", "fr"],
      messagePath: "i18n/{locale}/common.json",
    })
  ).toEqual({
    $schema: "https://assets.gtx.dev/config-schema.json",
    defaultLocale: "en",
    locales: ["de", "fr"],
    files: { json: { include: ["i18n/[locale]/common.json"] } },
    options: {
      saveLocal: true,
      jsonSchema: {
        "i18n/*/common.json": { include: [GT_MESSAGE_TEXT_JSONPATH] },
      },
    },
  });
});

test("locales that need plural forms beyond English's, other than many, are flagged", () => {
  expect(
    localesNeedingExtraPluralForms("en", [
      "en",
      "de",
      "fr",
      "es",
      "ja",
      "ru",
      "pl",
      "ar",
    ])
  ).toEqual(["ru", "pl", "ar"]);
});
