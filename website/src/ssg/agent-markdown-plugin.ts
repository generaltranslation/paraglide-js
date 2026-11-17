import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Plugin } from "vite";
import {
  LLMS_FULL_FILE,
  buildLlmsFullText,
  listMarkdownPageSources,
  markdownPathForRoute,
  mirrorMarkdownForRoute,
  toAgentMarkdown,
  type AgentMarkdownPage,
  type MarkdownPageSource,
} from "../docs/agent-markdown";

type AgentMarkdownOptions = {
  repoRoot: string;
  siteUrl: string;
  fetch?: typeof globalThis.fetch;
  warn?: (message: string) => void;
};

/** Loads every docs page as agent-ready Markdown, in navigation order. */
export async function loadAgentMarkdownPages({
  repoRoot,
  siteUrl,
  fetch = globalThis.fetch,
  warn = console.warn,
  pages: sources = listMarkdownPageSources(),
}: AgentMarkdownOptions & { pages?: MarkdownPageSource[] }): Promise<
  AgentMarkdownPage[]
> {
  const pages = await Promise.all(
    sources.map(async (page) => {
      let markdown: string;
      if (page.mirrored) {
        // The site falls back to a redirect when GitHub is unreachable, so skip
        // the page here too rather than failing the deploy.
        const response = await fetch(page.source).catch(() => undefined);
        if (!response?.ok) {
          warn(`Skipping ${page.route} in agent Markdown: could not fetch ${page.source}`);
          return undefined;
        }
        markdown = mirrorMarkdownForRoute(page.route, await response.text());
      } else {
        markdown = await readFile(join(repoRoot, page.source), "utf8");
      }
      return { route: page.route, markdown: toAgentMarkdown(markdown, page, siteUrl) };
    })
  );
  return pages.filter((page): page is AgentMarkdownPage => Boolean(page));
}

/** Maps output file names (`llms-full.txt`, `basics.md`, ...) to their contents. */
export async function buildAgentMarkdownFiles(options: AgentMarkdownOptions) {
  const pages = await loadAgentMarkdownPages(options);
  const files = new Map<string, string>();
  files.set(LLMS_FULL_FILE, buildLlmsFullText(pages, options.siteUrl));
  for (const page of pages) {
    files.set(markdownPathForRoute(page.route).slice(1), `${page.markdown}\n`);
  }
  return files;
}

/**
 * Emits `/llms-full.txt` and `/<route>.md` into the client build and serves
 * them from the dev server.
 */
export function agentMarkdownPlugin(
  options: Omit<AgentMarkdownOptions, "warn">
): Plugin {
  return {
    name: "paraglide-agent-markdown",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = request.url?.split("?")[0];
        const isLlmsFull = path === `/${LLMS_FULL_FILE}`;
        const page = listMarkdownPageSources().find(
          (entry) => markdownPathForRoute(entry.route) === path
        );
        if (!isLlmsFull && !page) return next();
        try {
          const warn = (message: string) => server.config.logger.warn(message);
          const content = isLlmsFull
            ? (await buildAgentMarkdownFiles({ ...options, warn })).get(LLMS_FULL_FILE)
            : (await loadAgentMarkdownPages({ ...options, warn, pages: [page!] }))[0]
                ?.markdown;
          if (content === undefined) return next();
          response.setHeader(
            "Content-Type",
            isLlmsFull ? "text/plain; charset=utf-8" : "text/markdown; charset=utf-8"
          );
          response.end(isLlmsFull ? content : `${content}\n`);
        } catch (error) {
          next(error);
        }
      });
    },
    async generateBundle() {
      if (this.environment?.name !== "client") return;
      const files = await buildAgentMarkdownFiles({
        ...options,
        warn: (message) => this.warn(message),
      });
      for (const [fileName, source] of files) {
        this.emitFile({ type: "asset", fileName, source });
      }
    },
  };
}
