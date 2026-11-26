import { afterAll, beforeAll, describe, expect, test } from "vitest";
import * as sdk from "@inlang/sdk";
import messageFormat from "@inlang/plugin-message-format";
import { memfs } from "memfs";
import { createProject as typescriptProject, ts } from "@ts-morph/bootstrap";
import { compileCatalog, type CatalogInput } from "./compile-project.js";
import type { CompilerOptions } from "./compiler-options.js";
import { collectTextOnlyInputs } from "./compile-bundle.js";

const settings = {
  baseLocale: "en",
  locales: ["en", "de"],
  modules: [],
  "plugin.inlang.messageFormat": { pathPattern: "/messages/{locale}.json" },
};
const select = (
  declarations: string[],
  selectors: string[],
  match: Record<string, string>
) => [{ declarations, selectors, match }];
const english = {
  // plain interpolation: string | number
  summary_failed: "The latest summary failed: {error}",
  // `name` is interpolated, `count` goes through a formatter
  inbox: "Hi {name}, you have {count: number} messages",
  last_seen: "Last seen {date: datetime}",
  // `amount` is interpolated here and formatted in German
  balance: "Balance: {amount}",
  // match literals without a catchall keep their literal union
  auth_error: select(["input type"], ["type"], {
    "type=invalid": "Invalid ({type})",
    "type=empty": "Empty",
  }),
  // a selector with a catchall keeps NonNullable<unknown>
  status: select(["input status"], ["status"], {
    "status=ready": "Ready",
    "status=*": "Status: {status}",
  }),
  // an input behind a :plural local keeps NonNullable<unknown>
  items: select(
    ["input count", "local category = count: plural"],
    ["category"],
    { "category=one": "One item", "category=*": "{count} items" }
  ),
};
const german = {
  ...english,
  summary_failed: "Die letzte Zusammenfassung ist fehlgeschlagen: {error}",
  balance: "Kontostand: {amount: number}",
};

/** Bundles the message format plugin has no syntax for. */
const handWrittenBundles: sdk.BundleNested[] = [
  // `.local who = {$name}`, then `Hello {$who}`: an alias is text too
  bundle(
    "alias_greeting",
    [
      { type: "input-variable", name: "name" },
      {
        type: "local-variable",
        name: "who",
        value: {
          type: "expression",
          arg: { type: "variable-reference", name: "name" },
        },
      },
    ],
    [
      { type: "text", value: "Hello " },
      { type: "expression", arg: { type: "variable-reference", name: "who" } },
    ]
  ),
  // `{#link href=$url}Docs{/link}`: markup options keep NonNullable<unknown>
  bundle(
    "docs_link",
    [{ type: "input-variable", name: "url" }],
    [
      {
        type: "markup-start",
        name: "link",
        options: [
          { name: "href", value: { type: "variable-reference", name: "url" } },
        ],
        attributes: [],
      },
      { type: "text", value: "Docs" },
      { type: "markup-end", name: "link", options: [], attributes: [] },
    ]
  ),
];

let project: Awaited<ReturnType<typeof sdk.loadProjectFromDirectory>>;
let catalog: CatalogInput;
const fs = memfs({
  "/project.inlang/settings.json": JSON.stringify(settings),
  "/messages/en.json": JSON.stringify(english),
  "/messages/de.json": JSON.stringify(german),
}).fs as unknown as typeof import("node:fs");

beforeAll(async () => {
  project = await sdk.loadProjectFromDirectory({
    path: "/project.inlang",
    fs,
    providePlugins: [messageFormat as sdk.InlangPlugin],
  });
  catalog = {
    settings: await project.settings.get(),
    bundles: [
      ...(await sdk.selectBundleNested(project.db).execute()),
      ...handWrittenBundles,
    ],
  };
});
afterAll(async () => {
  await project?.close();
});

test("collectTextOnlyInputs finds the inputs that are only interpolated", () => {
  const textOnly = Object.fromEntries(
    catalog.bundles.map((bundle) => [
      bundle.id,
      [...collectTextOnlyInputs(bundle)].sort(),
    ])
  );
  expect(textOnly).toEqual({
    summary_failed: ["error"],
    inbox: ["name"],
    last_seen: [],
    balance: [],
    auth_error: [],
    status: [],
    items: [],
    alias_greeting: ["name"],
    docs_link: [],
  });
});

test("collectTextOnlyInputs follows locals and annotation options", () => {
  const input = (
    name: string,
    annotation?: sdk.FunctionReference
  ): sdk.Declaration => ({ type: "input-variable", name, annotation });
  const local = (
    name: string,
    of: string,
    annotation?: sdk.FunctionReference
  ): sdk.Declaration => ({
    type: "local-variable",
    name,
    value: {
      type: "expression",
      arg: { type: "variable-reference", name: of },
      annotation,
    },
  });
  const read = (name: string): sdk.Expression => ({
    type: "expression",
    arg: { type: "variable-reference", name },
  });
  const fn = (
    name: string,
    options: sdk.FunctionReference["options"] = []
  ): sdk.FunctionReference => ({ type: "function-reference", name, options });
  const option = (name: string, variable: string) => ({
    name,
    value: { type: "variable-reference" as const, name: variable },
  });
  const textOnly = (declarations: sdk.Declaration[], pattern: sdk.Pattern) =>
    [...collectTextOnlyInputs(bundle("b", declarations, pattern))].sort();

  // `.local a = {$name}`, `.local b = {$a}`, `{$b}`
  expect(
    textOnly([input("name"), local("a", "name"), local("b", "a")], [read("b")])
  ).toEqual(["name"]);
  // `.local a = {$name}`, `.local n = {$a :number}`, `{$a} {$n}`
  expect(
    textOnly(
      [input("name"), local("a", "name"), local("n", "a", fn("number"))],
      [read("a"), read("n")]
    )
  ).toEqual([]);
  // `{$n :number minimumFractionDigits=$digits} {$digits}`
  expect(
    textOnly(
      [input("n"), input("digits")],
      [
        {
          type: "expression",
          arg: { type: "variable-reference", name: "n" },
          annotation: fn("number", [option("minimumFractionDigits", "digits")]),
        },
        read("digits"),
      ]
    )
  ).toEqual([]);
  // `{$n :relativetime unit=$unit} {$unit}`
  expect(
    textOnly(
      [input("n"), input("unit")],
      [
        {
          type: "expression",
          arg: { type: "variable-reference", name: "n" },
          annotation: fn("relativetime", [
            { name: "unit", value: { type: "literal", value: "$unit" } },
          ]),
        },
        read("unit"),
      ]
    )
  ).toEqual([]);
  // `.input {$date :datetime timeZone=$zone}`, `{$date} {$zone}`
  expect(
    textOnly(
      [
        input("date", fn("datetime", [option("timeZone", "zone")])),
        input("zone"),
      ],
      [read("date"), read("zone")]
    )
  ).toEqual([]);
  // an input no pattern reads
  expect(textOnly([input("unused"), input("name")], [read("name")])).toEqual([
    "name",
  ]);
});

const strictConsumer = `
import { m } from "./messages.js";

// inputs that are only interpolated take text
m.summary_failed({ error: "timeout" }) satisfies string;
m.summary_failed({ error: 504 }) satisfies string;
// @ts-expect-error - an object renders as "[object Object]"
m.summary_failed({ error: { code: 504, message: "timeout" } });
// @ts-expect-error - a Date renders in the host's format, not the locale's
m.summary_failed({ error: new Date() });
m.alias_greeting({ name: "Ada" }) satisfies string;
// @ts-expect-error - interpolated through an un-annotated local
m.alias_greeting({ name: { first: "Ada" } });

// formatter inputs keep NonNullable<unknown>
m.inbox({ name: "Ada", count: 3 }) satisfies string;
m.inbox({ name: "Ada", count: "3" }) satisfies string;
// @ts-expect-error - name is only interpolated
m.inbox({ name: { first: "Ada" }, count: 3 });
m.last_seen({ date: new Date() }) satisfies string;
m.balance({ amount: 12.5 }) satisfies string;
m.balance({ amount: 12n }) satisfies string;
m.items({ count: 3 }) satisfies string;
m.items({ count: "3" }) satisfies string;

// selectors keep their types
m.auth_error({ type: "invalid" }) satisfies string;
// @ts-expect-error - unknown match value
m.auth_error({ type: "typo" });
m.status({ status: "ready" }) satisfies string;
m.status({ status: true }) satisfies string;

// markup options keep NonNullable<unknown>
m.docs_link({ url: new URL("https://example.com") }) satisfies string;
`;

const defaultConsumer = `
import { m } from "./messages.js";

m.summary_failed({ error: "timeout" }) satisfies string;
m.summary_failed({ error: { code: 504, message: "timeout" } }) satisfies string;
m.summary_failed({ error: new Date() }) satisfies string;
m.alias_greeting({ name: { first: "Ada" } }) satisfies string;
m.inbox({ name: { first: "Ada" }, count: 3 }) satisfies string;
m.auth_error({ type: "invalid" }) satisfies string;
// @ts-expect-error - unknown match value
m.auth_error({ type: "typo" });
`;

const layouts = [
  { outputStructure: "message-modules" },
  { outputStructure: "message-modules", messageModuleSize: 2 },
  { outputStructure: "locale-modules" },
] satisfies Partial<CompilerOptions>[];

for (const layout of layouts) {
  for (const emitTsDeclarations of [false, true]) {
    describe(`${JSON.stringify(layout)} (dts: ${emitTsDeclarations})`, () => {
      test("strictInputTypes types text-only inputs string | number", async () => {
        const output = await compileCatalog({
          catalog,
          compilerOptions: {
            ...layout,
            emitTsDeclarations,
            strictInputTypes: true,
          },
        });
        expect(await typeErrors(output, strictConsumer)).toEqual([]);
      });

      test("without strictInputTypes, inputs accept any value", async () => {
        const compilerOptions = { ...layout, emitTsDeclarations };
        const output = await compileCatalog({ catalog, compilerOptions });
        expect(output).toEqual(
          await compileCatalog({
            catalog,
            compilerOptions: { ...compilerOptions, strictInputTypes: false },
          })
        );
        expect(await typeErrors(output, defaultConsumer)).toEqual([]);
      });
    });
  }
}

test("strictInputTypes changes only types, not the compiled messages", async () => {
  const compilerOptions = {
    outputStructure: "message-modules",
    strategy: ["baseLocale"],
  } satisfies Partial<CompilerOptions>;
  const strict = await compileCatalog({
    catalog,
    compilerOptions: { ...compilerOptions, strictInputTypes: true },
  });
  const loose = await compileCatalog({ catalog, compilerOptions });
  const typesRemoved = (output: Record<string, string>) =>
    Object.fromEntries(
      Object.entries(output).map(([name, code]) => [
        name,
        code.replaceAll("string | number", "NonNullable<unknown>"),
      ])
    );
  expect(strict["messages/summary_failed.js"]).toContain(
    "{ error: string | number }"
  );
  expect(typesRemoved(strict)).toEqual(typesRemoved(loose));
});

/**
 * Type-checks the consumer against the generated output (JavaScript with
 * JSDoc, or only the declarations if there are any) and returns the errors.
 */
async function typeErrors(
  output: Record<string, string>,
  consumer: string
): Promise<string[]> {
  const declarationsOnly = Object.keys(output).some((name) =>
    name.endsWith(".d.ts")
  );
  const tsProject = await typescriptProject({
    useInMemoryFileSystem: true,
    compilerOptions: {
      allowJs: !declarationsOnly,
      checkJs: !declarationsOnly,
      noEmit: true,
      strict: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.Node16,
      moduleResolution: ts.ModuleResolutionKind.Node16,
    },
  });
  for (const [name, code] of Object.entries(output)) {
    if (declarationsOnly ? name.endsWith(".d.ts") : name.endsWith(".js")) {
      tsProject.createSourceFile(name, code);
    }
  }
  tsProject.createSourceFile("consumer.ts", consumer);
  return ts
    .getPreEmitDiagnostics(tsProject.createProgram())
    .map(
      (diagnostic) =>
        `${diagnostic.file?.fileName}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`
    )
    .filter((message) => !message.includes("'async_hooks'"));
}

function bundle(
  id: string,
  declarations: sdk.Declaration[],
  pattern: sdk.Pattern
): sdk.BundleNested {
  return {
    id,
    declarations,
    messages: settings.locales.map((locale) => ({
      id: `${id}_${locale}`,
      bundle_id: id,
      locale,
      selectors: [],
      variants: [
        {
          id: `${id}_${locale}_variant`,
          message_id: `${id}_${locale}`,
          matches: [],
          pattern,
        },
      ],
    })),
  };
}
