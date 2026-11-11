---
title: Virtual Messages in Vite
description: Keep public generated entry points while serving individual messages as virtual modules.
---

# Virtual messages in Vite

Vite uses `locale-modules` for its dev server and Vitest, and `virtual-modules`
for production builds. Virtual output keeps the public generated entry points
on disk and serves individual message implementations through Vite. You can
also select it explicitly for development:

```ts
import { defineConfig } from "vite";
import { paraglideVitePlugin } from "@inlang/paraglide-js";

export default defineConfig({
	plugins: [
		paraglideVitePlugin({
			project: "./project.inlang",
			outdir: "./src/paraglide",
			outputStructure: "virtual-modules", // opt in during development too
		}),
	],
});
```

`outputStructure: "virtual-modules"` is available only through the Vite plugin
and is its default for `vite build`. Omitting the option uses `locale-modules`
for `vite serve` and Vitest, reducing the number of HTTP module requests.
Select `"message-modules"` or `"locale-modules"` in the plugin or project config
when you need physical message files. CLI, programmatic and other bundler
output keep their existing defaults; they reject `"virtual-modules"` because
those surfaces cannot serve Vite virtual modules.

## Configuration precedence

Explicit CLI flags or plugin options override project configuration. Project
configuration overrides defaults. A default never replaces an explicit value.
Keep shared output settings in `project.inlang/paraglide.config.ts` so tools can
find them in one place:

```ts
export default {
	outdir: "./src/paraglide",
	outputStructure: "virtual-modules",
};
```

The Vite plugin then only needs `project: "./project.inlang"`. The explicit
layout in the project file is optional; omitting it lets Vite choose locale
modules for serve and virtual modules for builds. A standalone compile of this
explicitly virtual project fails instead of silently changing its layout. To intentionally generate physical
files for a standalone script, use a separate output directory:

```sh
paraglide-js compile --output-structure message-modules --outdir ./generated-for-scripts
```

An explicit `emitTsDeclarations: false` is preserved and reported as incompatible
with virtual modules. Enable declarations or explicitly select a physical layout;
Paraglide does not silently ignore the boolean or choose a different layout.

## Application imports

Keep importing the generated public entry point:

```ts
import { m, hello } from "./paraglide/messages.js";
import type { HelloInputs } from "./paraglide/messages.js";

const inputs: HelloInputs = { name: "Ada" };
m.hello(inputs);
hello(inputs, { locale: "de" });
```

The application retains message input types, locale unions, metadata and markup
types. When virtual output is active, Vite rewrites verified named imports and safe static `m.hello()` accesses
to individual virtual message imports, reducing the graph needed for the first
development SSR request. Individual modules retain message-level tree shaking.

Dynamic namespace access, namespace escape, mutation, shadowing and direct
`eval` retain the full barrel. `import * as messages` and imports through another
re-export barrel also retain the full barrel. These patterns remain supported;
they do not receive the static-import optimization.

## Generated output

With virtual output, excluding optional README and ignore files, there are nine physical files:

```text
paraglide/
  runtime.js
  runtime.d.ts
  server.js
  server.d.ts
  registry.js
  registry.d.ts
  messages.js
  messages.d.ts
  messages.virtual.d.ts
```

`messages.js` contains a comment explaining the Vite integration and explicit
imports from an output-scoped `virtual:paraglide/<output-id>/messages/_index.js`
module. The compiler holds that index and the individual message implementations
in memory; it does not emit individual message files.

The small `messages.d.ts` references one combined `messages.virtual.d.ts`. It
declares the virtual index with the same signatures used for ordinary disk
output. TypeScript derives the `m` namespace from that module. Applications need
no additional ambient-module setup, tsconfig changes or suppression comments.

Compilation still processes the catalog. The optimization reduces filesystem
output and the modules Vite must process for supported static accesses; it does
not make catalog compilation lazy.

## Development and production

The default dev layout loads the public message entry point, its index, and
one module per locale. This avoids one HTTP request per message in large
browser test suites and pages that use many messages. It loads the whole
catalog, so an isolated page using few messages can still load faster with
explicit virtual output. Choose `outputStructure: "virtual-modules"` if that
trade-off suits your project.

Defaults follow Vite's command, not `NODE_ENV`, `mode`, or the `isDevelopment`
compiler option: `vite build --mode development` still uses virtual modules,
and `NODE_ENV=production vite serve` still uses locale modules. The implicit
Vite layouts retain generated TypeScript declarations. An explicit declaration
opt-out is supported for physical output; virtual output requires declarations.

Keep the Paraglide plugin enabled for development and production builds. With
virtual output, edits use the normal compiler queue and tracked filesystem
watcher. A successful
publication updates physical declarations and the virtual implementations, then
invalidates affected importers. A compilation failure preserves the last
successfully published virtual graph and uses the existing error handling.

Production builds resolve the virtual modules into ordinary client and SSR
chunks. The resulting application runs without a Vite development server or a
custom production module loader.

The generated virtual-backed outdir itself requires the Vite integration.
Other Vite-based tools, such as Vitest or Storybook, must also load the Paraglide
Vite plugin when consuming this output. Standalone Node scripts, other bundlers
and direct individual-message deep imports require physical output. For a Vite project that also runs standalone
scripts against its generated messages, select a physical layout explicitly:

```ts
paraglideVitePlugin({
	project: "./project.inlang",
	outdir: "./src/paraglide",
	outputStructure: "message-modules",
});
```

The same option can be set in `project.inlang/paraglide.config.js`. Explicit
plugin options override project config; otherwise project config overrides the
Vite default. Watched config edits can switch layouts. Remove an explicit
`outputStructure` from both plugin options and project config to use the
automatic serve/build defaults.

## Compatibility

- Virtual output enables declarations and rejects an explicit `emitTsDeclarations: false`, including one in the project
  configuration. The global compiler boolean default remains unchanged.
- Requires `messageModuleSize: 1`. For grouped physical output, select
  `outputStructure: "message-modules"` explicitly.
- Cannot be combined with `experimentalPerLocaleBuild`; that specialized backend
  keeps its existing physical-layout defaults.
- Virtual module IDs are internal implementation details; import the public
  `messages.js` entry point in application code.
