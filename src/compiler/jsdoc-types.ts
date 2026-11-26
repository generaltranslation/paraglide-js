import type { InputVariable } from "@inlang/sdk";
import { renderInputMatchTypeVariants } from "./match-literals.js";
import { isValidIdentifier, quotePropertyKey } from "./variable-access.js";

/** How a bundle uses one of its inputs, as far as its type is concerned. */
export type InputMatchType = {
  literals: Set<string>;
  hasCatchAll: boolean;
  /**
   * The input is only interpolated as text: never a selector, never
   * formatted, never a markup option. Set only with the `strictInputTypes`
   * compiler option. Such an input is typed `string | number` instead of
   * `NonNullable<unknown>`.
   */
  textOnly?: boolean;
};

export type InputMatchTypes = Map<string, InputMatchType>;

/**
 * The type of an input that `strictInputTypes` finds to be only interpolated
 * as text. Other values would interpolate as `[object Object]` or similar.
 */
export const textInputType = "string | number";

export function jsDocBundleFunctionTypes(args: {
  inputs: InputVariable[];
  locales: string[];
  matchTypes?: InputMatchTypes;
  inputTypeOverride?: string;
}): string {
  const localesUnion = args.locales.map((locale) => `"${locale}"`).join(" | ");
  const inputType =
    args.inputTypeOverride ?? inputsType(args.inputs, args.matchTypes);

  return `
* @param {${inputType}} inputs
* @param {{ locale?: ${localesUnion} }} options
* @returns {LocalizedString}`;
}

/**
 * Returns the types for the input variables.
 *
 * @example
 *   const inputs = [{ name: "age" }]
 *   inputsType(inputs)
 *   >> "{ age: NonNullable<unknown> }"
 */
export function inputsType(
  inputs: InputVariable[],
  matchTypes?: InputMatchTypes
): string {
  if (inputs.length === 0) {
    return "{}";
  }

  // Deduplicate inputs by name to avoid TypeScript errors with duplicate properties in JSDoc
  const uniqueInputMap = new Map<string, InputVariable>();

  for (const input of inputs) {
    uniqueInputMap.set(input.name, input);
  }

  const uniqueInputs = Array.from(uniqueInputMap.values());

  const inputParams = uniqueInputs
    .map((input) => {
      const name = isValidIdentifier(input.name)
        ? input.name
        : quotePropertyKey(input.name);
      return `${name}: ${resolveInputType(input.name, matchTypes)}`;
    })
    .join(", ");
  return `{ ${inputParams} }`;
}

function resolveInputType(name: string, matchTypes?: InputMatchTypes): string {
  if (!matchTypes) return "NonNullable<unknown>";

  const info = matchTypes.get(name);
  if (!info) return "NonNullable<unknown>";
  // A text-only input is never a selector, so it has no match literals.
  if (info.textOnly) return textInputType;
  if (info.hasCatchAll) return "NonNullable<unknown>";

  const literals = Array.from(info.literals);
  if (literals.length === 0) return "NonNullable<unknown>";

  literals.sort();
  return literals
    .flatMap((value) => renderInputMatchTypeVariants(value))
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(" | ");
}

export function inputTypeForName(
  name: string,
  matchTypes?: InputMatchTypes
): string {
  return resolveInputType(name, matchTypes);
}
