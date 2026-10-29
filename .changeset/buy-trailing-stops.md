---
"@polyester/sdk": minor
---

pr: #206

Trailing-stop triggers can buy. Pass `side: "buy"` with a `limitPrice`, the most the child pays. It must be at least `activationPrice` when that is set. A sell trailing stop is still the default and rejects `limitPrice`. Trigger configurations decode `limitPrice` for a buy trailing stop.
