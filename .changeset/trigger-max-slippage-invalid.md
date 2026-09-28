---
"@polyester/sdk": patch
---

Decode the `MAX_SLIPPAGE_INVALID` trigger failure as `failureReason: "max_slippage_invalid"` instead of `"unspecified"`. Triggers fail with this reason when their maximum slippage cannot produce a valid execution price bound.
