---
title: Translating Messages
"og:title": "Paraglide JS translation — General Translation, inlang CLI, and Fink"
description: "Translate Paraglide JS message files with General Translation through the inlang CLI, in your terminal, with coding agents and in CI. Or review in Fink, or edit by hand."
---

# Translating Messages

We recommend [General Translation](https://generaltranslation.com/?utm_source=paraglidejs&utm_medium=docs&utm_content=translating-messages), the company that maintains Paraglide JS, to translate your message files. The [inlang CLI](https://inlang.com/m/2qj2w8pu/app-inlang-cli) uses it by default: one command fills every missing translation in `messages/{locale}.json`, and Paraglide compiles the result into the same type-safe message functions you already use. Your translations stay in your repository.

You can also translate without a General Translation account: the inlang CLI works with your own DeepL, Google or OpenAI key, or with the free community translation service. See [Other providers](#other-providers).

| Workflow                                                                     | When to use it                                                     |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **[General Translation](#translate-with-general-translation) (recommended)** | Fill missing translations with the inlang CLI, locally or in CI    |
| [Fink](#review-with-translators)                                             | Have translators or reviewers edit messages through a browser      |
| [By hand](#translate-by-hand)                                                | Translate or adjust a small number of messages directly            |
| [Other providers](#other-translation-options)                                | Use your own DeepL, Google or OpenAI key, or the community service |

These workflows can be combined. For example, translate with General Translation, then review the results in Fink.

## Translate with General Translation

You need a General Translation account. You can [get started for free](https://dash.generaltranslation.com/?utm_source=paraglidejs&utm_medium=docs&utm_content=translating-messages); see [pricing](https://generaltranslation.com/pricing) for usage charges. The steps below need `@inlang/cli` 3.7.0 or later and Node.js 20.3 or later.

### 1. Translate

> [!TIP]
> Commit your message files first, so you can review the translations as a diff.

In your project's root, run:

```sh
npx @inlang/cli machine translate --project ./project.inlang
```

The first time, the command asks which translation provider the project should use. Choose **General Translation**. It signs you in through your browser, asks which of your General Translation projects to use or creates one, and then translates.

It translates from `baseLocale` into every other locale in `project.inlang/settings.json`. To translate only some, add `--targetLocales de,fr`.

Sign-in saves two files next to `project.inlang`:

- `.env.local` gets a development key that can only translate. The command adds `.env.local` to `.gitignore` unless git already ignores it.
- `gt.config.json` gets the project ID. Commit it, so teammates who sign in use the same project instead of creating their own.

If your project has an older `@inlang/cli` in its `devDependencies`, `npx` runs that one: update it, or run `npx @inlang/cli@latest machine translate --project ./project.inlang`.

### 2. Review

Review the wording and run the translation checks:

```sh
npx @inlang/cli check --project ./project.inlang
```

These checks catch issues such as missing translations and variables (see [Checking translations](/checking-translations)). Review the translated text as well, especially short labels, product terminology, and important user flows.

### What gets translated

- **Missing translations only.** A message that already has a translation in a locale keeps it, so your edits are never overwritten. This also means a changed source message keeps its old translations; see [After changing a source message](#after-changing-a-source-message).
- **Placeholders and [markup](/markup)** are kept. A translation that drops or changes one isn't saved; the command lists it and exits with code 1.
- **[Variants](/variants) such as plurals** get every form the target language needs: an English message with `one` and `other` gets `one`, `few`, `many` and `other` in Russian.
- **Descriptions** of your messages are sent as context, and never end up in the translated text.

Each locale is saved as soon as it's done, so a run that is stopped keeps the locales it finished.

### After changing a source message

The command doesn't notice that a source message changed: its translations in other locales keep the old wording, and `inlang check` still passes, because nothing is missing. To translate a changed message again:

1. Delete the message's translations from the other locales' files, such as `messages/de.json`.
2. Run `npx @inlang/cli machine translate --project ./project.inlang`.
3. Review the new translations.

A passing `inlang check` means translations are complete and keep their variables, not that they match your latest wording.

### With coding agents

A coding agent can't choose a General Translation project for you. If your project doesn't have a `gt.config.json` with a project ID yet, first do one of these:

- Run `npx @inlang/cli machine translate --project ./project.inlang` once in your own terminal and choose or create the project there.
- Set `GT_PROJECT_ID` in `.env.local` to a project ID from the [General Translation dashboard](https://dash.generaltranslation.com/?utm_source=paraglidejs&utm_medium=docs&utm_content=translating-messages).

Without either, the command creates a project only if your account has none and belongs to one organization; otherwise it stops after sign-in.

Then have the agent run:

```sh
npx @inlang/cli machine translate --project ./project.inlang --no-browser
```

It prints a sign-in link and code for you to open. Once you sign in, it saves the key and translates. Later runs reuse the key in `.env.local` without signing in.

### In CI

Add two secrets: `GT_API_KEY`, an API key from the [General Translation dashboard](https://dash.generaltranslation.com/?utm_source=paraglidejs&utm_medium=docs&utm_content=translating-messages), and `GT_PROJECT_ID`, the ID in your committed `gt.config.json`. After installing dependencies, fill missing translations and check them before your build:

```yaml
- run: npx @inlang/cli machine translate --project ./project.inlang
  env:
    GT_API_KEY: ${{ secrets.GT_API_KEY }}
    GT_PROJECT_ID: ${{ secrets.GT_PROJECT_ID }}
- run: npx @inlang/cli check --project ./project.inlang
```

Run this in a trusted workflow, and save the updated message files in a pull request so you can review the translations before deploying them.

Because `gt.config.json` names a General Translation project, a run without the key, as in a pull request from a fork, fails instead of sending your messages to another service.

## Review with translators

Translators and reviewers can use [Fink](https://fink.inlang.com/docs/paraglide-js) to review General Translation's output or edit messages in the browser, and save changes to GitHub.

## Other translation options

Paraglide compiles message files regardless of how they were translated.

### Other providers

The inlang CLI can also translate with your own DeepL, Google or OpenAI key; see [bring your own key](https://inlang.com/m/2qj2w8pu/app-inlang-cli/byok). Or choose the **community translation service** at the first run's question: it needs no account, but it's operated independently of inlang and its availability isn't guaranteed. Review the results before shipping.

### The gt CLI

General Translation's own CLI translates Paraglide message files too, and translates changed source messages again on each run; see [its Paraglide quickstart](https://generaltranslation.com/docs/integrations/paraglide/quickstart?utm_source=paraglidejs&utm_medium=docs&utm_content=translating-messages). It needs extra configuration for the inlang message format, and doesn't support plurals that need more forms in the target language yet, such as English plurals translated into Russian or Polish.

### Translate by hand

For a small number of messages, edit each locale's message file directly and rebuild your app.

## Next steps

- [Check translations](/checking-translations) for missing translations, variables, and unused messages.
- Add [variants](/variants) for plurals and gender.
- Use [markup](/markup) for links and emphasis inside translated text.
