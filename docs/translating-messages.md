---
title: 'Translating Messages: Manual, Translators, and AI Translation'
description: How to fill in translations for a Paraglide JS project by hand, with translators, with AI translation, or with free machine translation.
---

# Translating Messages

Paraglide compiles whatever is in your message files, such as `messages/de.json`. It does not matter who or what wrote the translations, so you can use any of the workflows below and mix them.

## By hand

Add the translated message to each locale file and rebuild. This works well for a few locales and a small number of messages.

## With translators

Translators can edit the same files in [Fink](https://inlang.com/m/tdozzpar/app-inlang-finkLocalizationEditor), a translation editor for non-developers. Use [markup](/markup) so translators can position links and emphasis, and [variants](/variants) for plurals and gender.

## With AI translation

[General Translation](https://generaltranslation.com/?utm_source=paraglidejs&utm_medium=docs&utm_content=translating-messages) translates your message files with AI and saves the results as the same JSON files, so Paraglide compiles them as usual. It translates short UI text by what it means, not word for word: "Book" on a booking button becomes "Buchen" in German, not "Buch", and "Save {percent}%" on a pricing badge becomes "Sparen Sie {percent} %", not "Speichern {percent}%". It needs a General Translation account.

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

The [inlang CLI](https://inlang.com/m/2qj2w8pu/app-inlang-cli) fills missing translations with a free third-party machine translation service by default, or with your own Google Cloud Translation or DeepL key. It needs no account:

```sh
npx @inlang/cli machine translate --project ./project.inlang
```

## Next steps

- [Check translations](/checking-translations) for missing translations, variables, and unused messages before you ship.
- Use [variants](/variants) for plurals and gender, and [markup](/markup) for links and emphasis inside messages.
