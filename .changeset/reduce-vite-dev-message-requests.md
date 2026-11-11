---
"@inlang/paraglide-js": patch
---

Use locale modules by default in Vite dev servers and Vitest to avoid one HTTP request per message in large catalogs. Keep virtual modules for Vite builds, preserve explicit layout overrides, and retain generated TypeScript declarations for the default layouts.
