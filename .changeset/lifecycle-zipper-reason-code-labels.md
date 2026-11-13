---
"@polyester/sdk": minor
---

Breaking: Lifecycle `zipperReason.code` is a label such as `"deposit_amount_below_minimum"` instead of a number, like every other enum. An uncataloged code reads `unknown_zipper_reason_${code}`.
