// Proxies /ingest/* to PostHog so ad blockers don't drop analytics; everything else is static assets.

type Env = {
  ASSETS: { fetch(request: Request): Promise<Response> };
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/ingest/")) return env.ASSETS.fetch(request);

    const host = url.pathname.startsWith("/ingest/static/")
      ? "us-assets.i.posthog.com"
      : "us.i.posthog.com";
    const headers = new Headers(request.headers);
    headers.delete("cookie");
    // Preserve the visitor IP for PostHog's cookieless hash.
    headers.set(
      "x-forwarded-for",
      request.headers.get("cf-connecting-ip") ?? ""
    );

    return fetch(
      `https://${host}${url.pathname.replace(/^\/ingest/, "")}${url.search}`,
      {
        method: request.method,
        headers,
        body: request.body,
      }
    );
  },
};
