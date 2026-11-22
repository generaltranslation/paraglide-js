---
"@inlang/paraglide-js": patch
---

`generateStaticLocalizedUrls()` no longer returns duplicate URLs. Before, the same localized URL appeared more than once when input URLs repeated or normalized to the same path, for example `/about` and `/about/` with `trailingSlash: "never"`.
