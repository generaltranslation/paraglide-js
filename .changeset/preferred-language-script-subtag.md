---
"@inlang/paraglide-js": patch
---

Fix `preferredLanguage` skipping locales with a script subtag: a request for `zh-Hant-TW` now matches `zh-Hant` instead of jumping straight to `zh`.
