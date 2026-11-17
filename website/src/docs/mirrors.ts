// Pages mirrored from TanStack's own Paraglide examples. Kept free of Vite-only
// APIs (such as import.meta.glob) so the build can also export them as Markdown.

export type MirrorSpec = {
  rawUrl: string;
  sourceUrl: string;
  sourceLabel: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  heroImage: string;
  heroImageAlt: string;
  pitch: string;
  // Appended after the mirrored example.
  outro: string;
};

const translateMessagesOutro = (content: string) =>
  [
    "## Translate your messages",
    "",
    `Paraglide compiles whatever is in your message files, such as \`messages/de.json\`. To translate them automatically and keep them updated as your app changes, we recommend [General Translation](https://generaltranslation.com/docs/integrations/paraglide/quickstart?utm_source=paraglidejs&utm_medium=docs&utm_content=${content}). See [Translating messages](https://paraglidejs.com/translating-messages) for setup and other options.`,
  ].join("\n");

export const mirrorPages: Record<string, MirrorSpec> = {
  "/tanstack-router": {
    rawUrl:
      "https://raw.githubusercontent.com/TanStack/router/main/examples/react/i18n-paraglide/README.md",
    sourceUrl:
      "https://github.com/TanStack/router/tree/main/examples/react/i18n-paraglide",
    sourceLabel: "TanStack/router",
    ogTitle: "Paraglide JS for TanStack Router",
    ogDescription:
      "Type-safe i18n with tiny bundles. Integrated with TanStack Router and tested in TanStack's CI/CD pipeline.",
    ogImage: "https://inlang.com/tanstack-router-banner.svg",
    heroImage: "https://inlang.com/tanstack-router-banner.svg",
    heroImageAlt: "Paraglide JS for TanStack Router overview",
    pitch: [
      "- Fully type-safe with IDE autocomplete",
      "- SEO-friendly localized URLs",
      "- Works with CSR, SSR, and SSG",
      "- Tested as part of [TanStack's CI/CD pipeline](https://paraglidejs.com/blog/tanstack-ci)",
    ].join("\n"),
    outro: translateMessagesOutro("tanstack-router"),
  },
  "/tanstack-start": {
    rawUrl:
      "https://raw.githubusercontent.com/TanStack/router/main/examples/react/start-i18n-paraglide/README.md",
    sourceUrl:
      "https://github.com/TanStack/router/tree/main/examples/react/start-i18n-paraglide",
    sourceLabel: "TanStack/router",
    ogTitle: "Paraglide JS for TanStack Start",
    ogDescription:
      "Type-safe i18n with tiny bundles. Integrated with TanStack Start and tested in TanStack's CI/CD pipeline.",
    ogImage: "https://inlang.com/tanstack-start-banner.svg",
    heroImage: "https://inlang.com/tanstack-start-banner.svg",
    heroImageAlt: "Paraglide JS for TanStack Start overview",
    pitch: [
      "- Fully type-safe with IDE autocomplete",
      "- SEO-friendly localized URLs",
      "- Works with CSR, SSR, and SSG",
      "- Tested as part of [TanStack's CI/CD pipeline](https://paraglidejs.com/blog/tanstack-ci)",
      "",
      "## Why use Paraglide with TanStack Start?",
      "",
      "TanStack maintains a [Paraglide example](https://github.com/TanStack/router/tree/main/examples/react/start-i18n-paraglide). TanStack Router continues to own the route tree, loaders, and navigation; Paraglide supplies typed message functions, locale detection, localized URL mapping, and request-scoped locale handling for SSR. The setup below shows how these pieces compose.",
      "",
      "Translations can stay in version-controlled JSON files. `project.inlang/settings.json` configures locales, file paths, and format plugins; no hosted translation service is required. Existing i18next JSON can use the [i18next plugin](https://inlang.com/m/3i8bor92/plugin-inlang-i18next), and ICU MessageFormat 1 can use the [ICU plugin](https://inlang.com/m/p7c8m1d2/plugin-inlang-icu-messageformat-1).",
      "",
      "Static message imports let the bundler remove unused messages. This differs from loading only the active locale: default output includes configured locales for retained messages. Compare [benchmark methodology](https://paraglidejs.com/benchmark) and [compiler options](https://paraglidejs.com/compiling-messages) against your own routes, messages, and locale count. Do not compare total app transfer sizes with library-only overhead.",
      "",
      "Locale switching uses document navigation by default so the localized URL, server-rendered HTML, and client locale agree. See [locale switching](https://paraglidejs.com/basics#getting-and-setting-the-locale) before implementing an in-place switcher.",
    ].join("\n"),
    outro: translateMessagesOutro("tanstack-start"),
  },
};

export function buildMirrorMarkdown(spec: MirrorSpec, exampleMarkdown: string) {
  const cleaned = stripLeadingMarkdownH1(stripFrontmatterBlock(exampleMarkdown));
  return [
    "---",
    `og:title: ${spec.ogTitle}`,
    `og:description: ${spec.ogDescription}`,
    `og:image: ${spec.ogImage}`,
    `twitter:image: ${spec.ogImage}`,
    `description: ${spec.ogDescription}`,
    "---",
    "",
    `# ${spec.ogTitle}`,
    "",
    `![${spec.heroImageAlt}](${spec.heroImage})`,
    "",
    spec.pitch,
    "",
    "---",
    "",
    "> [!NOTE]",
    `> This example is mirrored from the official TanStack example in the [${spec.sourceLabel}](${spec.sourceUrl}) repository.`,
    "",
    cleaned,
    "",
    spec.outro,
    "",
  ].join("\n");
}

function stripFrontmatterBlock(markdown: string) {
  if (!markdown.startsWith("---")) return markdown;
  const end = markdown.indexOf("\n---", 3);
  if (end === -1) return markdown;
  return markdown.slice(end + 4).trimStart();
}

function stripLeadingMarkdownH1(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line === undefined || line.trim() !== "") break;
    index += 1;
  }
  const firstContentLine = lines[index];
  if (firstContentLine !== undefined && firstContentLine.startsWith("# ")) {
    lines.splice(index, 1);
  }
  return lines.join("\n").trimStart();
}
