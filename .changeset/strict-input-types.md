---
"@inlang/paraglide-js": minor
---

Add the `strictInputTypes` compiler option. It types message inputs that are only interpolated as text (`"Failed: {error}"`) as `string | number` instead of `NonNullable<unknown>`, so passing an object, which would render as "[object Object]", is a type error. Inputs that are selectors, go through a formatter such as `:number` or `:datetime`, or are markup options keep their types. The option is off by default.
