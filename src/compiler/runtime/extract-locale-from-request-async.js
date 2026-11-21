import { customServerStrategies, isCustomStrategy } from "./strategy.js";
import { getStrategyForUrl } from "./route-strategy.js";
import { toLocale } from "./check-locale.js";
import { extractLocaleForStrategy } from "./extract-locale-from-request.js";

/**
 * Asynchronously extracts a locale from a request.
 *
 * This function supports async custom server strategies, unlike the synchronous
 * `extractLocaleFromRequest`. Use this function when you have custom server strategies
 * that need to perform asynchronous operations (like database calls) in their getLocale method.
 *
 * The function goes through the strategies in the order they are defined, awaiting
 * custom server strategies and resolving built-in strategies like `extractLocaleFromRequest`.
 *
 * @see {@link https://github.com/opral/inlang-paraglide-js/issues/527#issuecomment-2978151022}
 *
 * @example
 *   // Basic usage
 *   const locale = await extractLocaleFromRequestAsync(request);
 *
 * @example
 *   // With custom async server strategy
 *   defineCustomServerStrategy("custom-database", {
 *     getLocale: async (request) => {
 *       const userId = extractUserIdFromRequest(request);
 *       return await getUserLocaleFromDatabase(userId);
 *     }
 *   });
 *
 *   const locale = await extractLocaleFromRequestAsync(request);
 *
 * @param {Request} request - The request object to extract the locale from.
 * @param {{ effectiveRequestUrl?: string | URL }} [options] - Effective request URL to use for route matching and locale detection with the URL strategy.
 * @returns {Promise<Locale>} The extracted locale.
 */
export const extractLocaleFromRequestAsync = async (request, options = {}) => {
  const effectiveRequestUrl = resolveEffectiveRequestUrlFromRequestAsync(
    request,
    options.effectiveRequestUrl
  );
  const strategy = getStrategyForUrl(effectiveRequestUrl);

  for (const strat of strategy) {
    /** @type {Locale|undefined} */
    let matchedLocale;
    if (isCustomStrategy(strat) && customServerStrategies.has(strat)) {
      const handler = customServerStrategies.get(strat);
      matchedLocale = toLocale(
        handler ? await handler.getLocale(request) : undefined
      );
    } else {
      matchedLocale = extractLocaleForStrategy(
        request,
        strat,
        effectiveRequestUrl
      );
    }
    if (matchedLocale) {
      return matchedLocale;
    }
  }

  throw new Error(
    "No locale found. There is an error in your strategy. Try adding 'baseLocale' as the very last strategy. Read more here https://paraglidejs.com/errors#no-locale-found"
  );
};

/**
 * @param {Request} request
 * @param {string | URL | undefined} effectiveRequestUrl
 * @returns {URL}
 */
function resolveEffectiveRequestUrlFromRequestAsync(
  request,
  effectiveRequestUrl = request.url
) {
  if (effectiveRequestUrl instanceof URL) {
    return new URL(effectiveRequestUrl.href);
  }

  return new URL(effectiveRequestUrl, request.url);
}
