---
"@inlang/paraglide-js": patch
---

Fix Vitest reusing stale cached transforms of rewritten message imports after `outputStructure` changes outside the Vite config file. The plugin now registers a Vitest cache key (`defineCacheKeyGenerator`) derived from the effective virtual output and its message ids.
