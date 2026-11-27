import { toLocale } from "./check-locale.js";

/**
 * Negotiates a preferred language from navigator.languages.
 *
 * Use the function on the client to extract the locale
 * from the navigator.languages array.
 *
 * @example
 *   const locale = extractLocaleFromNavigator();
 *
 * @returns {Locale | undefined}
 */
export function extractLocaleFromNavigator() {
  if (!navigator?.languages?.length) {
    return undefined;
  }

  for (const lang of navigator.languages) {
    // Drop one subtag at a time, so that `zh-Hant-TW` matches `zh-Hant`
    // before `zh` (RFC 4647 lookup)
    const subtags = lang.split("-");
    while (subtags.length > 0) {
      const locale = toLocale(subtags.join("-"));
      if (locale) {
        return locale;
      }
      subtags.pop();
    }
  }

  return undefined;
}
