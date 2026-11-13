# Paraglide JS website

Source for [paraglidejs.com](https://paraglidejs.com). It is a TanStack Start app that is prerendered to static HTML at build time and served by the `paraglide-js` Cloudflare Worker as static assets.

## Development

From the repository root:

```sh
pnpm install
pnpm --filter @inlang/paraglide-js-website dev
```

## Build

```sh
pnpm build:website
```

The output is written to `website/dist/client`. Pages come from `marketplace-manifest.json` and `blog/table_of_contents.json` (see `src/ssg/static-pages.ts`).

## Deployment

Cloudflare Workers Builds deploys the site on every merge to `main`. Builds for other branches are off.

| Setting        | Value                                                                                |
| -------------- | ------------------------------------------------------------------------------------ |
| Root directory | `/` (repository root)                                                                |
| Build command  | `npx -y pnpm@10.23.0 install --frozen-lockfile && npx -y pnpm@10.23.0 build:website` |
| Deploy command | `npx wrangler deploy --config website/wrangler.jsonc`                                |

Build and deploy logs are on the Worker's **Deployments** tab in the Cloudflare dashboard.

### Environment variables

Variables read through `import.meta.env` are inlined by Vite at build time, so they belong under **Settings → Build → Variables and secrets** in Cloudflare, not under the Worker's runtime variables. Anything set there ships in the client bundle, so only add values that are safe to make public.
