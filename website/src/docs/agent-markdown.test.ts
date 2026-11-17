import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createServer } from "vite";
import {
  buildLlmsFullText,
  listMarkdownPageSources,
  markdownPathForRoute,
  toAgentMarkdown,
} from "./agent-markdown";
import { getDocsSections } from "./data";
import { agentMarkdownPlugin, buildAgentMarkdownFiles } from "../ssg/agent-markdown-plugin";

const SITE = "https://paraglidejs.com";
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const localPage = (source: string, route = "/page") => ({
  route,
  source,
  mirrored: false,
});

describe("agent Markdown export", () => {
  it("lists every rendered docs page in navigation order", () => {
    const routes = listMarkdownPageSources().map((page) => page.route);
    const navRoutes = getDocsSections()
      .flatMap((section) => section.pages)
      .filter((page) => !page.isExternal)
      .map((page) => page.route);

    expect(routes).toEqual(navRoutes);
    expect(routes).toContain("/translating-messages");
    expect(routes).toContain("/tanstack-router");
    expect(routes).toContain("/tanstack-start");
    expect(routes.some((route) => route.includes("Fink"))).toBe(false);
  });

  it("marks TanStack pages as mirrored from GitHub", () => {
    const tanstackStart = listMarkdownPageSources().find(
      (page) => page.route === "/tanstack-start"
    );
    expect(tanstackStart).toMatchObject({
      mirrored: true,
      source: expect.stringContaining("raw.githubusercontent.com/TanStack/router"),
    });
  });

  it("maps routes to Markdown paths", () => {
    expect(markdownPathForRoute("/")).toBe("/index.md");
    expect(markdownPathForRoute("/sveltekit")).toBe("/sveltekit.md");
    expect(markdownPathForRoute("basics/")).toBe("/basics.md");
  });

  it("drops frontmatter and makes links absolute", () => {
    const markdown = toAgentMarkdown(
      [
        "---",
        "imports:",
        "  - https://example.com/component.js",
        "---",
        "",
        "# Basics",
        "",
        "See [errors](./errors#switching-locales) and [variants](/variants).",
        "Read the [runtime API](../docs-api/runtime/type/README.md).",
        "Open [the example](../examples/react/src/main.tsx) or [MDN](https://developer.mozilla.org).",
        "![Diagram](./assets/diagram.png)",
        '<img src="./assets/logo.svg" />',
        "Jump to [a heading](#a-heading).",
      ].join("\n"),
      localPage("docs/basics.md", "/basics"),
      SITE
    );

    expect(markdown.startsWith("# Basics")).toBe(true);
    expect(markdown).not.toContain("imports:");
    expect(markdown).toContain(`[errors](${SITE}/errors#switching-locales)`);
    expect(markdown).toContain(`[variants](${SITE}/variants)`);
    expect(markdown).toContain(`[runtime API](${SITE}/runtime)`);
    expect(markdown).toContain(
      "[the example](https://github.com/opral/paraglide-js/blob/main/examples/react/src/main.tsx)"
    );
    expect(markdown).toContain("[MDN](https://developer.mozilla.org)");
    expect(markdown).toContain(
      "![Diagram](https://raw.githubusercontent.com/opral/paraglide-js/refs/heads/main/docs/assets/diagram.png)"
    );
    expect(markdown).toContain(
      'src="https://raw.githubusercontent.com/opral/paraglide-js/refs/heads/main/docs/assets/logo.svg"'
    );
    expect(markdown).toContain("[a heading](#a-heading)");
  });

  it("leaves code blocks untouched", () => {
    const code = ["```tsx", '<img src="./logo.svg" />', "[x](./basics.md)", "```"].join(
      "\n"
    );
    const markdown = toAgentMarkdown(
      `Intro [basics](./basics.md)\n\n${code}\n`,
      localPage("docs/strategy.md"),
      SITE
    );
    expect(markdown).toContain(`[basics](${SITE}/basics)`);
    expect(markdown).toContain(code);
  });

  it("resolves mirrored page links against TanStack's repository", () => {
    const page = listMarkdownPageSources().find(
      (entry) => entry.route === "/tanstack-router"
    )!;
    const markdown = toAgentMarkdown("[Router file](./src/router.tsx)", page, SITE);
    expect(markdown).toBe(
      "[Router file](https://github.com/TanStack/router/blob/main/examples/react/i18n-paraglide/src/router.tsx)"
    );
  });

  it("joins pages under a header that points back to the site", () => {
    const text = buildLlmsFullText(
      [
        { route: "/", markdown: "# Paraglide JS" },
        { route: "/basics", markdown: "# Basics\n\nHello" },
      ],
      SITE
    );

    expect(text).toMatch(/^# Paraglide JS documentation\n/);
    expect(text).toContain(`${SITE}/llms.txt`);
    expect(text).toContain(`${SITE}/translating-messages`);
    expect(text).toContain("utm_source=paraglidejs");
    expect(text.indexOf(`Source: ${SITE}/\n`)).toBeLessThan(
      text.indexOf(`Source: ${SITE}/basics\n`)
    );
    expect(text.endsWith("Hello\n")).toBe(true);
  });

  it("builds llms-full.txt and one Markdown file per docs page", async () => {
    const fetch = vi.fn(async (url: string) =>
      new Response(`# Example\n\nMirrored from ${url}`)
    ) as unknown as typeof globalThis.fetch;
    const files = await buildAgentMarkdownFiles({ repoRoot, siteUrl: SITE, fetch });
    const pages = listMarkdownPageSources();

    expect([...files.keys()]).toEqual([
      "llms-full.txt",
      ...pages.map((page) => markdownPathForRoute(page.route).slice(1)),
      "_headers",
    ]);
    expect(files.get("translating-messages.md")).toContain("General Translation");
    expect(files.get("tanstack-start.md")).toContain("# Paraglide JS for TanStack Start");
    expect(files.get("tanstack-start.md")).toContain("## Translate your messages");

    const full = files.get("llms-full.txt")!;
    const headers = files.get("_headers")!;
    let previous = -1;
    for (const page of pages) {
      const sourceUrl = `${SITE}${page.route === "/" ? "" : page.route}`;
      const path = markdownPathForRoute(page.route);
      expect(files.get(path.slice(1))?.startsWith(`Source: ${sourceUrl}\n\n`), page.route).toBe(true);
      expect(headers).toContain(
        `${path}\n  Content-Type: text/markdown; charset=utf-8\n  Link: <${sourceUrl}>; rel="canonical"\n`
      );
      const index = full.indexOf(
        `Source: ${SITE}${page.route === "/" ? "/" : page.route}\n`
      );
      expect(index, page.route).toBeGreaterThan(previous);
      previous = index;
    }
  });

  it("serves the same source links and canonical headers in development", async () => {
    const options = {
      repoRoot,
      siteUrl: `${SITE}/`,
      fetch: vi.fn(async () => new Response("# Example\n\nMirrored content")) as unknown as typeof globalThis.fetch,
    };
    const files = await buildAgentMarkdownFiles(options);
    const server = await createServer({
      configFile: false,
      root: join(repoRoot, "website"),
      plugins: [agentMarkdownPlugin(options)],
      server: { host: "127.0.0.1", port: 0 },
    });

    try {
      await server.listen();
      const baseUrl = server.resolvedUrls!.local[0]!;
      for (const [path, canonical] of [
        ["/index.md", SITE],
        ["/basics.md", `${SITE}/basics`],
        ["/tanstack-start.md", `${SITE}/tanstack-start`],
      ]) {
        const response = await globalThis.fetch(new URL(path!, baseUrl));
        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
        expect(response.headers.get("Link")).toBe(`<${canonical}>; rel="canonical"`);
        expect(await response.text()).toBe(files.get(path!.slice(1)));
      }

      const full = await globalThis.fetch(new URL("/llms-full.txt", baseUrl));
      expect(full.headers.get("Link")).toBeNull();
      expect(await full.text()).toBe(files.get("llms-full.txt"));
    } finally {
      await server.close();
    }
  });

  it("skips mirrored pages GitHub cannot serve instead of failing the build", async () => {
    const warn = vi.fn();
    const fetch = vi.fn(
      async () => new Response("nope", { status: 503 })
    ) as unknown as typeof globalThis.fetch;
    const files = await buildAgentMarkdownFiles({ repoRoot, siteUrl: SITE, fetch, warn });

    expect(files.has("tanstack-start.md")).toBe(false);
    expect(files.has("basics.md")).toBe(true);
    expect(files.get("_headers")).not.toContain("/tanstack-start.md");
    expect(files.get("_headers")).not.toContain("/tanstack-router.md");
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
