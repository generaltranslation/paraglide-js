/**
 * Cloudflare Worker in front of the static site.
 *
 * Proxies `/ingest/*` to PostHog so analytics requests come from paraglidejs.com
 * and aren't dropped by ad blockers. Every other request is served from the
 * static assets.
 */

type Env = {
  ASSETS: { fetch(request: Request): Promise<Response> };
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/ingest/")) {
      return proxyToPostHog(request, url);
    }
    return env.ASSETS.fetch(request);
  },
};

function proxyToPostHog(request: Request, url: URL) {
  const host = url.pathname.startsWith("/ingest/static/")
    ? "us-assets.i.posthog.com"
    : "us.i.posthog.com";
  const target = `https://${host}${url.pathname.replace(/^\/ingest/, "")}${url.search}`;

  const headers = new Headers(request.headers);
  headers.delete("cookie");
  const clientIp = request.headers.get("cf-connecting-ip");
  if (clientIp) headers.set("x-forwarded-for", clientIp);

  return fetch(target, {
    method: request.method,
    headers,
    body: request.body,
    redirect: "manual",
  });
}
