---
"@inlang/paraglide-js": patch
---

Evaluate custom server strategies in their configured order in `extractLocaleFromRequestAsync` and `paraglideMiddleware`. Before, a custom strategy always took precedence over built-in strategies listed before it, such as `url` or `cookie`.

To keep the old behaviour, list your custom strategy first. With the default URL patterns, `url` resolves a locale for every path, so a custom strategy listed after it never runs.
