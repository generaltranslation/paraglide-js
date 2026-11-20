---
"@inlang/paraglide-js": patch
---

Apply the configured `trailingSlash` policy to the catch-all fast path of `localizeUrl` and `deLocalizeUrl`. Previously `localizeHref("/", { locale: "en" })` returned `/en/` with `trailingSlash: "never"` because the fast path returned before normalization.
