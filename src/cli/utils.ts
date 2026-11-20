import consola from "consola";
import nodePath from "node:path";

/**
 * One step in a CLI chain.
 * Defines which types the context needs to extend and how it extends the context
 *
 * Cli Steps can be chained to slowly build up the context over time
 *
 * @example
 * ```ts
 * const step1:  CliStep<unknown, { foo: string }> = async (ctx) => {
 *    return {...ctx, foo: "hello" }
 * }
 *
 * const step2: CliStep<{ foo: string }, { bar: number }> = async (ctx) => {
 *   return { ...ctx, bar: 42 }
 * }
 *
 * const initial = { baz: "baz" } as const;
 * const ctx1 = await step1(initial);
 * const ctx2 = await step2(ctx1);
 *
 * ctx2 // Has type { foo: string, bar: number, baz: "baz" }
 * ```
 */
export type CliStep<In extends object, Out> = <Ctx extends In>(
  ctx: Ctx
) => Promise<Ctx & Out>;

/**
 * Wrapper to exit the process if the user presses CTRL+C.
 */
export const prompt: typeof consola.prompt = async (message, options) => {
  const response = await consola.prompt(message, options);
  if (response?.toString() === "Symbol(clack:cancel)") {
    process.exit(0);
  }
  return response;
};

export const promptSelection = async <T extends string>(
  message: string,
  options: { initial?: T; options: { label: string; value: T }[] } = {
    options: [],
  }
): Promise<T> => {
  return prompt(message, {
    type: "select",
    ...options,
  }) as unknown as Promise<T>;
};

/**
 * A path relative to `root` with forward slashes and without a leading `./`,
 * for messages and package.json scripts.
 *
 * @example
 *   toRelativeDisplayPath("/app", "./project.inlang") // "project.inlang"
 *   toRelativeDisplayPath("/app", "/app/src/paraglide") // "src/paraglide"
 */
export function toRelativeDisplayPath(root: string, path: string): string {
  return nodePath
    .relative(root, nodePath.resolve(root, path))
    .split(nodePath.sep)
    .join("/");
}

/**
 * A message `pathPattern`, which is relative to the inlang project's parent
 * folder, as a path relative to `root`.
 */
export function messagePathFromRoot(args: {
  root: string;
  projectPath: string;
  pathPattern: string;
}): string {
  return toRelativeDisplayPath(
    args.root,
    nodePath.resolve(
      nodePath.dirname(nodePath.resolve(args.root, args.projectPath)),
      args.pathPattern
    )
  );
}

/** Quote package-script arguments containing shell metacharacters. */
export function shellArgument(value: string): string {
  return /^[A-Za-z0-9_./-]+$/.test(value)
    ? value
    : "'" + value.replaceAll("'", `'"'"'`) + "'";
}

/**
 * Whether a version range may resolve to a version before `version`, judged
 * by the first version it names (`^3.0.0`, `3.2.0`, `~2.1.0`). Ranges without
 * a version (`latest`, `*`, `workspace:*`) are trusted.
 */
export function mayBeOlderThan(args: {
  range: string;
  version: string;
}): boolean {
  const [named, minimum] = [args.range, args.version].map(versionNumbers);
  if (!named || !minimum) return false;
  for (const part of [0, 1, 2] as const) {
    if (named[part] !== minimum[part]) return named[part] < minimum[part];
  }
  return false;
}

function versionNumbers(
  text: string
): [major: number, minor: number, patch: number] | undefined {
  const match = text.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
}
