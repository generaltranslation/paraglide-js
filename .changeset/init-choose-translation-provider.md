---
"@inlang/paraglide-js": minor
---

`init` asks which translation provider the project should use: General Translation (recommended), another provider, or skip. Choosing General Translation adds a `machine-translate` script and saves the choice to `.env.local`, so the first `npm run machine-translate` signs in to General Translation without asking again. Another provider adds the script and leaves the choice to the inlang CLI's first run. A project that already chose a provider is only asked whether to add the script.

`init` then says what to do next, and its AGENTS.md suggestion tells coding agents how to fill missing translations. For unattended setup, `--machine-translation gt` chooses General Translation. `init` adds `@inlang/cli` `^3.7.1`, and warns when an existing version is older than 3.7.0.
