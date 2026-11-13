---
title: Translating Messages
"og:title": "Paraglide JS translation — General Translation, inlang CLI, and Fink"
description: "Automatically translate Paraglide JS message files with General Translation and keep them updated in CI, or use machine translation from the inlang CLI, Fink, or manual edits."
---

# Translating Messages

We recommend [General Translation](https://generaltranslation.com/?utm_source=paraglidejs&utm_medium=docs&utm_content=translating-messages) to translate your Paraglide JS message files and keep them updated as your app changes.

General Translation writes translations to files such as `messages/de.json`. Paraglide compiles those files into the same type-safe message functions you already use. You keep your Paraglide setup, and your translations stay in your repository.

Short UI messages can have more than one meaning. In a test of short UI messages, General Translation translated "Book" on a booking button as "Buchen" in German, where the inlang CLI's default service returned "Buch", a book you read.

| Workflow                                                                     | When to use it                                                                         |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **[General Translation](#translate-with-general-translation) (recommended)** | Automatically translate UI messages and keep them updated as your app changes          |
| [inlang CLI](#translate-with-the-inlang-cli)                                 | Fill missing translations using the community service or your own provider credentials |
| [Fink](#review-with-translators)                                             | Have translators or reviewers edit messages through a browser                          |
| [By hand](#translate-by-hand)                                                | Translate or adjust a small number of messages directly                                |

These workflows can be combined. For example, translate with General Translation, then review the results in Fink.

## Translate with General Translation

You need a General Translation account. You can [get started for free](https://dash.generaltranslation.com/?utm_source=paraglidejs&utm_medium=docs&utm_content=translating-messages); see [pricing](https://generaltranslation.com/pricing) for usage charges.

### Supported message files

The steps below use the default inlang message format, with files at `messages/{locale}.json`.

- **Supported:** messages with placeholders and [markup](/markup), nested message objects, and [variants](/variants) such as plurals.
- **Plurals:** end each plural variant in your source messages with a `*` branch, such as `countPlural=*`, instead of `countPlural=other`. If a language uses a plural form your source messages do not have, such as the form French and Spanish use for large round numbers, Paraglide falls back to the `*` branch.

### 1. Set up the CLI

Install the CLI and initialize a translation project:

```sh
npm install --save-dev gt
npx gt init --no-react-setup --file-patterns "json=messages/[locale].json" --dev-credentials
```

Follow the prompts to sign in and choose your languages. Use the same source locale as `baseLocale` in `project.inlang/settings.json`, and choose target locales from its `locales`. If your messages have plurals, leave out Russian, Ukrainian, Polish, Czech and Arabic for now; see [Limits](#limits).

The flags configure GT to translate your existing message files:

- `--no-react-setup` leaves your app's code unchanged. If the wizard suggests installing `gt-react`, skip that step: Paraglide continues to handle your app's messages.
- `--file-patterns` specifies where your message files live.
- `--dev-credentials` creates the translation project and saves its ID to `.env.local`.

For coding agents: `gt init` needs a signed-in user. Run `npx gt login --no-browser` and ask the user to open the sign-in link it prints. Add `--json` to `gt init` for structured output and non-interactive behavior, and pass `--default-locale` and `--locales`. Reuse the project's existing GT project with `--project-id <id>` when one is already configured; otherwise, use `--create-project --org-id <id>` to create one. `gt init` lists any options it still needs.

### 2. Configure your message files

Merge the `options` block below into the `gt.config.json` that `gt init` created. Keep its `defaultLocale`, `locales` and `files`.

```json
{
  "defaultLocale": "en",
  "locales": ["de", "fr"],
  "files": {
    "json": {
      "include": ["messages/[locale].json"]
    }
  },
  "options": {
    "saveLocal": true,
    "jsonSchema": {
      "messages/*.json": {
        "include": [
          "$..[?(typeof @ === 'string' && @property !== '$schema' && !(typeof @property === 'number' && (@parentProperty === 'declarations' || @parentProperty === 'selectors')))]"
        ]
      }
    }
  }
}
```

The `jsonSchema` rule selects the text of every message, including nested messages and each variant, for translation. It skips the `$schema` URL and the `declarations` and `selectors` lists of variants, so message structure stays unchanged.

> [!IMPORTANT]
> Keep this rule when using the inlang message format. Without it, declarations and selectors in [variants](/variants), such as `"input count"`, can be translated and prevent your project from compiling.

With `saveLocal`, edits to supported message strings are kept on later runs; see [Limits](#limits) for target-language plural forms.

### 3. Translate and review

> [!WARNING]
> Before your first translation, commit your message files. The first run rewrites target-locale files from your source messages, including translations already in those files. Review the diff and restore any existing translations you want to keep.

Run:

```sh
npx gt translate
```

General Translation writes the translated files into your messages directory. Review the wording and run the translation checks:

```sh
npx @inlang/cli check --project ./project.inlang
```

These checks catch issues such as missing translations and variables, and need `@inlang/cli` 3.4.0 or later (see [Checking translations](/checking-translations)). Review the translated text as well, especially short labels, product terminology, and important user flows.

Commit your message files and `gt-lock.json`. The lockfile records downloaded translations so `saveLocal` can identify your manual edits on later runs.

### 4. Keep translations updated

When you change your source messages, run:

```sh
npx gt translate
```

Changed source messages are translated again. With `saveLocal` enabled and `gt-lock.json` committed, the CLI can preserve your local edits between runs.

To automate translation in CI, add two secrets: `GT_API_KEY`, a server-side API key from the [General Translation dashboard](https://dash.generaltranslation.com/?utm_source=paraglidejs&utm_medium=docs&utm_content=translating-messages) with permission to upload files and enqueue translations (not the development key from `gt init`), and `GT_PROJECT_ID`, the project ID `gt init` saved in `.env.local`, whatever its variable name there.

After installing dependencies, run translation and validation before your build:

```yaml
- run: npx gt translate
  env:
    GT_API_KEY: ${{ secrets.GT_API_KEY }}
    GT_PROJECT_ID: ${{ secrets.GT_PROJECT_ID }}
- run: npx @inlang/cli check --project ./project.inlang
```

Run this in a trusted workflow. Save updated message files and `gt-lock.json` together in a pull request so you can review the translations before deploying them.

### Limits

Plural messages that need more forms in the target language than in your source language are not supported yet, for example English plurals translated into Russian, Ukrainian, Polish, Czech or Arabic, which use extra forms for everyday numbers. General Translation does not create those forms yet, and does not keep ones you add by hand, so affected plural messages use the wrong grammar for some numbers and fail `inlang check`. If your message files contain these plurals, leave the affected languages out of `locales` in `gt.config.json` and translate them another way. If your message files have no plurals, these languages work like any other.

## Review with translators

Translators and reviewers can use [Fink](https://fink.inlang.com/docs/paraglide-js) to review General Translation's output or edit messages in the browser, and save changes to GitHub.

## Other translation options

Paraglide compiles message files regardless of how they were translated. You can combine General Translation with manual editing or use another translation workflow.

### Translate with the inlang CLI

The [inlang CLI](https://inlang.com/m/2qj2w8pu/app-inlang-cli) can fill missing translations using a free, community-operated service, without an account:

```sh
npx @inlang/cli machine translate --project ./project.inlang
```

The default service is operated independently of inlang, and its availability is not guaranteed.

You can also use your own Google Cloud Translation, DeepL, or OpenAI credentials. See [bring your own key](https://inlang.com/m/2qj2w8pu/app-inlang-cli/byok) for configuration and provider requirements.

Review the results before shipping.

### Translate by hand

For a small number of messages, edit each locale's message file directly and rebuild your app.

## Next steps

- [Check translations](/checking-translations) for missing translations, variables, and unused messages.
- Add [variants](/variants) for plurals and gender.
- Use [markup](/markup) for links and emphasis inside translated text.
