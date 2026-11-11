---
"@inlang/paraglide-js": patch
---

Don't reload Vite environments when the first virtual message output is published in `buildStart`. Vite buffered that `full-reload` and replayed it to the first browser that connected, so the first page opened after `vite dev` started reloaded itself. Replacing the virtual output and editing messages still reload.
