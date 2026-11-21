---
"@inlang/paraglide-js": patch
---

Evaluate custom server strategies in their configured order in `extractLocaleFromRequestAsync` and `paraglideMiddleware`. Before, a custom strategy always took precedence over built-in strategies listed before it, such as `url` or `cookie`.
