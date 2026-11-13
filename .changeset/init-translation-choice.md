---
"@inlang/paraglide-js": minor
---

`init` now asks how you want to translate your messages: General Translation, the inlang CLI's machine translation, or neither. Choosing General Translation adds a `gt.config.json` that translates your message files in place, the `gt` CLI and a `translate` script. Unattended runs take `--translation gt|inlang|none`; `--machine-translation` and `--no-machine-translation` still work. The AGENTS.md suggestion and the generated README now say how to translate messages.
