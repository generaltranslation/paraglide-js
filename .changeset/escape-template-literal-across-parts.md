---
"@inlang/paraglide-js": patch
---

Escape `${` in compiled messages when the `$` and `{` come from separate text parts, or from text on either side of markup that is stripped in string output. Before, a pattern like `cost $` followed by `{1 + 1}` compiled to a live template literal substitution.
