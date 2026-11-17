// Markdown versions of the docs for AI answer engines and coding agents:
// `/llms-full.txt` (every page in nav order) and `/<route>.md` (one page).
// This module must stay free of Vite-only APIs (import.meta.glob, import.meta.env)
// because the build plugin in `src/ssg/agent-markdown-plugin.ts` runs it in Node.
import manifest from "../../../marketplace-manifest.json";
import { buildMirrorMarkdown, mirrorPages } from "./mirrors";

export const LLMS_FULL_FILE = "llms-full.txt";

const REPOSITORY_BLOB_BASE = "https://github.com/opral/paraglide-js/blob/main/";
const REPOSITORY_RAW_BASE =
  "https://raw.githubusercontent.com/opral/paraglide-js/refs/heads/main/";
// Docs that link to these files land on the page that renders them.
const SOURCE_ALIASES: Record<string, string> = {
  "docs/compiler-options.md": "/compiler-options",
  "docs/standalone-servers.md": "/standalone-servers",
  "docs-api/runtime/type/README.md": "/runtime",
  "docs-api/server/type/README.md": "/server",
};

export type MarkdownPageSource = {
  route: string;
  // Repository-relative path for local pages, the raw GitHub URL for mirrors.
  source: string;
  mirrored: boolean;
};

export type AgentMarkdownPage = {
  route: string;
  markdown: string;
};

/** Every docs page the site renders, in navigation order. */
export function listMarkdownPageSources(): MarkdownPageSource[] {
  const pages: MarkdownPageSource[] = [];
  for (const value of Object.values(manifest.pages)) {
    const entries = typeof value === "string" ? [] : Object.entries(value);
    for (const [rawRoute, source] of entries) {
      const route = normalizeRoute(rawRoute);
      const mirror = mirrorPages[route];
      if (mirror) {
        pages.push({ route, source: mirror.rawUrl, mirrored: true });
      } else if (source.endsWith(".md")) {
        pages.push({ route, source: toRepoPath(source), mirrored: false });
      }
    }
  }
  return pages;
}

export function markdownPathForRoute(route: string) {
  const normalized = normalizeRoute(route);
  return normalized === "/" ? "/index.md" : `${normalized}.md`;
}

export function mirrorMarkdownForRoute(route: string, exampleMarkdown: string) {
  const spec = mirrorPages[normalizeRoute(route)];
  if (!spec) throw new Error(`No mirrored page for ${route}`);
  return buildMirrorMarkdown(spec, exampleMarkdown);
}

/**
 * Prepares a page's source Markdown for readers outside the site: drops
 * frontmatter and makes links absolute, pointing at paraglidejs.com where the
 * target is a docs page and at GitHub otherwise. Code blocks are left as is.
 */
export function toAgentMarkdown(
  markdown: string,
  page: MarkdownPageSource,
  siteUrl: string
) {
  const routeBySource = buildRouteBySource();
  const mirror = page.mirrored ? mirrorPages[page.route] : undefined;
  const base = mirror
    ? {
        blob: `${mirror.sourceUrl.replace("/tree/", "/blob/")}/`,
        raw: dirnameUrl(mirror.rawUrl),
      }
    : {
        blob: dirnameUrl(REPOSITORY_BLOB_BASE + page.source),
        raw: dirnameUrl(REPOSITORY_RAW_BASE + page.source),
      };

  const rewrite = (url: string, kind: "link" | "image") => {
    if (!url || url.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(url)) {
      return url;
    }
    if (url.startsWith("//")) return url;
    if (url.startsWith("/")) return page.mirrored ? url : `${siteUrl}${url}`;

    const resolved = new URL(url, kind === "image" ? base.raw : base.blob);
    if (!page.mirrored && kind === "link") {
      const repoPath = resolved.href.startsWith(REPOSITORY_BLOB_BASE)
        ? decodeURIComponent(
            resolved.href.slice(REPOSITORY_BLOB_BASE.length).split(/[?#]/)[0]!
          )
        : undefined;
      const route = repoPath
        ? (routeBySource.get(repoPath) ?? routeBySource.get(`${repoPath}.md`))
        : undefined;
      if (route) {
        return `${siteUrl}${route === "/" ? "/" : route}${resolved.search}${resolved.hash}`;
      }
    }
    return resolved.href;
  };

  return mapOutsideCodeFences(stripFrontmatter(markdown), (text) =>
    text
      .replace(
        /(!?)\[([^\]]*)\]\(\s*<?([^)\s>]+)>?((?:\s+"[^"]*")?\s*)\)/g,
        (_match, bang: string, label: string, url: string, title: string) =>
          `${bang}[${label}](${rewrite(url, bang ? "image" : "link")}${title})`
      )
      .replace(
        /\b(src|href)=(["'])([^"']+)\2/gi,
        (_match, attr: string, quote: string, url: string) =>
          `${attr}=${quote}${rewrite(url, attr.toLowerCase() === "src" ? "image" : "link")}${quote}`
      )
  ).trim();
}

export function buildLlmsFullText(pages: AgentMarkdownPage[], siteUrl: string) {
  const header = [
    "# Paraglide JS documentation",
    "",
    `> Paraglide JS is a compiler-first i18n library for JavaScript and TypeScript apps. This file contains the full Markdown of every documentation page on ${siteUrl}, in navigation order. Each page is also available on its own by adding \`.md\` to its URL, for example ${siteUrl}${markdownPathForRoute("/basics")}. A shorter index is at ${siteUrl}/llms.txt.`,
    "",
    "Paraglide JS is maintained by General Translation (https://generaltranslation.com/?utm_source=paraglidejs&utm_medium=llms-full). To translate your messages, see " +
      `${siteUrl}/translating-messages.`,
  ].join("\n");

  const sections = pages.map((page) =>
    [
      "---",
      "",
      `Source: ${siteUrl}${page.route === "/" ? "/" : page.route}`,
      "",
      page.markdown.trim(),
    ].join("\n")
  );

  return [header, ...sections].join("\n\n") + "\n";
}

function buildRouteBySource() {
  const map = new Map<string, string>(Object.entries(SOURCE_ALIASES));
  for (const page of listMarkdownPageSources()) {
    if (!page.mirrored) map.set(page.source, page.route);
  }
  return map;
}

function mapOutsideCodeFences(markdown: string, map: (text: string) => string) {
  const lines = markdown.split("\n");
  const output: string[] = [];
  let buffer: string[] = [];
  let fence: string | undefined;

  const flush = () => {
    if (buffer.length) output.push(map(buffer.join("\n")));
    buffer = [];
  };

  for (const line of lines) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
    if (fence) {
      output.push(line);
      if (marker && marker[0] === fence[0] && marker.length >= fence.length) {
        fence = undefined;
      }
    } else if (marker) {
      flush();
      fence = marker;
      output.push(line);
    } else {
      buffer.push(line);
    }
  }
  flush();
  return output.join("\n");
}

function stripFrontmatter(markdown: string) {
  if (!markdown.startsWith("---")) return markdown;
  const end = markdown.indexOf("\n---", 3);
  if (end === -1) return markdown;
  return markdown.slice(end + 4).trimStart();
}

function dirnameUrl(url: string) {
  return url.slice(0, url.lastIndexOf("/") + 1);
}

function toRepoPath(source: string) {
  return source.replace(/^\.\//, "");
}

function normalizeRoute(route: string) {
  if (!route || route === "/") return "/";
  const withLeadingSlash = route.startsWith("/") ? route : `/${route}`;
  return withLeadingSlash.replace(/\/+$/, "") || "/";
}
