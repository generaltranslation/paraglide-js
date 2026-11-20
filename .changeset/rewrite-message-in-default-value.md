---
"@inlang/paraglide-js": patch
---

Keep the virtual-modules optimization when a message is read in a destructuring default value, such as `let { text = m.hello() } = $props()` in Svelte 5 server output. Before, any `m.key` below an `AssignmentPattern` made the file fall back to importing the whole message barrel.
