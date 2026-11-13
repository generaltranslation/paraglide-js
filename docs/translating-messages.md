---
title: "Translating Messages: General Translation, Machine Translation, and Translators"
description: How to translate a Paraglide JS project's message files with General Translation, machine translation, translators, or by hand.
---

# Translating Messages

To translate a Paraglide JS app, fill in each locale's message file, such as `messages/de.json`. Paraglide compiles whatever is in those files, so it does not matter who or what wrote the translations. For most projects we recommend General Translation. You can mix any of the workflows below.

| Workflow                                                       | Suitable when                                                                          | Account                        |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------ |
| [General Translation](#with-general-translation) (recommended) | You want translations that read like UI text, for many locales, updated in CI          | General Translation, free tier |
| [Free machine translation](#with-free-machine-translation)     | You want quick drafts, or already have a Google Cloud Translation, DeepL or OpenAI key | None                           |
| [Translators](#with-translators)                               | Translators or reviewers edit the text themselves                                      | Depends on the editor          |
| [By hand](#by-hand)                                            | You have a few locales and a small number of messages                                  | None                           |

## With General Translation

[General Translation](https://generaltranslation.com/?utm_source=paraglidejs&utm_medium=docs&utm_content=translating-messages) translates your message files and saves the results as the same JSON files, so Paraglide compiles them as usual. It translates short UI text by what it means, not word for word: "Book" on a booking button becomes "Buchen" in German, not "Buch", and "Save {percent}%" on a pricing badge becomes "Sparen Sie {percent} %", not "Speichern {percent}%". It needs a General Translation account, which has a free tier.

Install the CLI, then run `init` to sign in, create a project and write `gt.config.json`:

```sh
npm install --save-dev gt
npx gt init --no-react-setup --file-patterns "json=messages/[locale].json" --dev-credentials
```

- `--no-react-setup` keeps `init` from changing your app's code. Paraglide already handles your app's translations, so `gt` only needs to translate the message files.
- `--file-patterns` points `gt` at your message files.
- `--dev-credentials` creates the project and saves its ID to `.env.local`. Without it, `npx gt translate` has no project to translate in.

When `init` asks for your default locale and the locales to translate into, give the same ones as `baseLocale` and `locales` in `project.inlang/settings.json`.

Then add the `jsonSchema` and `saveLocal` options to `gt.config.json`:

```json
{
  "defaultLocale": "en",
  "locales": ["de", "fr"],
  "files": {
    "json": { "include": ["messages/[locale].json"] }
  },
  "options": {
    "saveLocal": true,
    "jsonSchema": {
      "messages/*.json": {
        "include": [
          "$[?(@property !== '$schema' && typeof @ === 'string')]",
          "$.*[*].match.*"
        ]
      }
    }
  }
}
```

> [!IMPORTANT]
> The `jsonSchema` option sends only message text to translation. Without it, the declarations and selectors of [variants](/variants), such as `"input count"`, can be translated too, and the project no longer compiles.

`saveLocal` keeps the edits you make by hand to a translated file the next time you translate.

> [!WARNING]
> The first `npx gt translate` rewrites each locale's message file from your source messages, including translations that are already there. Commit your message files first, so you can restore any translations you want to keep.

Then translate:

```sh
npx gt translate
```

Commit `gt-lock.json` with your message files. It records which translations were downloaded, which `saveLocal` needs to find your edits.

In CI, provide `GT_API_KEY` and `GT_PROJECT_ID` as secrets and translate before you build. Create the API key in the [dashboard](https://dash.generaltranslation.com/?utm_source=paraglidejs&utm_medium=docs&utm_content=translating-messages). The project ID is in `.env.local`.

```yaml
- run: npx gt translate
- run: npx @inlang/cli check --project ./project.inlang
```

## With free machine translation

The [inlang CLI](https://inlang.com/m/2qj2w8pu/app-inlang-cli) fills missing translations with machine translation. It is free and needs no account:

```sh
npx @inlang/cli machine translate --project ./project.inlang
```

By default it uses a community-operated translation service, which inlang does not operate and whose stability is not guaranteed. To use your own provider, set `INLANG_MACHINE_TRANSLATE_PROVIDER` to `google`, `deepl` or `openai` with the matching API key. See [bring your own key](https://inlang.com/m/2qj2w8pu/app-inlang-cli/byok).

Review machine translations before you ship. Short UI text can come out with the wrong sense: with the default service, "Book" on a booking button became "Buch" in German, the noun for a book you read.

## With translators

Translators can edit the message files in [Fink](https://inlang.com/m/tdozzpar/app-inlang-finkLocalizationEditor), a translation editor for non-developers. Use [markup](/markup) so translators can position links and emphasis, and [variants](/variants) for plurals and gender. Translations from General Translation or machine translation can be a first draft for them to review.

## By hand

Add the translated message to each locale file and rebuild. This works well for a few locales and a small number of messages.

## Next steps

- [Check translations](/checking-translations) for missing translations, variables, and unused messages before you ship.
- Use [variants](/variants) for plurals and gender, and [markup](/markup) for links and emphasis inside messages.
