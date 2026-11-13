---
title: Translating Messages
"og:title": "Paraglide JS translation — General Translation, inlang CLI, and Fink"
description: "Translate Paraglide JS message files with General Translation, and keep them updated as your app changes."
---

# Translating Messages

We recommend [General Translation](https://generaltranslation.com/?utm_source=paraglidejs&utm_medium=docs&utm_content=translating-messages) to translate your Paraglide JS message files and keep them updated as your app changes.

General Translation writes translations to files such as `messages/de.json`. Paraglide compiles those files into the same type-safe message functions you already use. You keep your Paraglide setup, and your translations stay in your repository.

Short UI messages can have more than one meaning: General Translation translates "Book" on a booking button as "Buchen" in German, where the inlang CLI's default service returns "Buch", a book you read.

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
- **Plurals:** end each plural variant in your source messages with a `*` branch, such as `countPlural=*`, instead of `countPlural=other`. General Translation translates the plural forms your source messages have, and the `*` branch covers any extra forms a language uses:
  - With an English source, German, Dutch, Japanese, Chinese and Korean use no extra forms.
  - French, Spanish, Italian and Portuguese use one extra form, only for large round numbers such as 1,000,000.
  - Russian, Ukrainian, Polish, Czech, Romanian, Arabic, Hebrew, and other Slavic and Baltic languages use extra forms for everyday numbers, so some numbers read slightly off, such as 2 to 4 in Russian. General Translation does not add these forms yet, and does not keep ones you add by hand. If exact plural grammar matters, leave these languages out of `locales` in `gt.config.json` and translate them another way.

### 1. Set up the CLI

Install the CLI and initialize a translation project:

```sh
npm install --save-dev gt
npx gt init --no-react-setup --file-patterns "json=messages/[locale].json" --dev-credentials
```

Follow the prompts to sign in and choose your languages. Use the same source and target locales as `baseLocale` and `locales` in `project.inlang/settings.json`.

The flags configure GT to translate your existing message files:

- `--no-react-setup` leaves your app's code unchanged. If the wizard suggests installing `gt-react`, skip that step: Paraglide continues to handle your app's messages.
- `--file-patterns` specifies where your message files live.
- `--dev-credentials` creates the translation project and saves its ID to `.env.local`.

### 2. Configure your message files

In `gt.config.json`, add the `jsonSchema` and `saveLocal` options shown below. Keep your own locales and file paths.

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
          "$..[?(typeof @ === 'string' && @property !== '$schema' && @parentProperty !== 'declarations' && @parentProperty !== 'selectors')]"
        ]
      }
    }
  }
}
```

The `jsonSchema` rule selects the text of every message, including nested messages and each variant, for translation, and leaves message structure unchanged.

> [!IMPORTANT]
> Keep this rule when using the inlang message format. Without it, declarations and selectors in [variants](/variants), such as `"input count"`, can be translated and prevent your project from compiling.

For the selected message strings, the `saveLocal` option preserves manual edits on subsequent translation runs. It does not preserve pre-existing translations on the first run.

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

These checks catch issues such as missing translations and variables. Review the translated text as well, especially short labels, product terminology, and important user flows.

Commit your message files and `gt-lock.json`. The lockfile records downloaded translations so `saveLocal` can identify your manual edits on later runs.

### 4. Keep translations updated

When you change your source messages, run:

```sh
npx gt translate
```

Changed source messages are translated again. With `saveLocal` enabled and `gt-lock.json` committed, the CLI can preserve your local edits between runs.

To automate translation in CI, provide `GT_API_KEY` and `GT_PROJECT_ID` as secrets. Create an API key in the [General Translation dashboard](https://dash.generaltranslation.com/?utm_source=paraglidejs&utm_medium=docs&utm_content=translating-messages); set `GT_PROJECT_ID` in CI to the project ID saved in `.env.local`. If it is stored as `VITE_GT_PROJECT_ID`, copy that value into the CI variable `GT_PROJECT_ID`. Use a server-side API key with permission to upload files and enqueue translations, not the development key saved by the setup wizard.

After installing dependencies, run translation and validation before your build:

```yaml
- run: npx gt translate
  env:
    GT_API_KEY: ${{ secrets.GT_API_KEY }}
    GT_PROJECT_ID: ${{ secrets.GT_PROJECT_ID }}
- run: npx @inlang/cli check --project ./project.inlang
```

Run this in a trusted workflow. Save updated message files and `gt-lock.json` together in a pull request so you can review the translations before deploying them.

## Review with translators

Translators and reviewers can use [Fink](https://fink.inlang.com/docs/paraglide-js) to edit your Paraglide message files in the browser and save changes to GitHub.

Use General Translation to produce the initial translations, then review and refine them with your team. You can also edit the JSON files directly.

Use [markup](/markup) for links and emphasis inside messages, and [variants](/variants) for plurals and gender.

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
