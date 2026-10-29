---
"@polyester/sdk": minor
---

pr: #207

`orders.cancelAllAfter` returns the armed switch's `effectiveScope`: `{ accountId, symbolId, side }`, where an unset `symbolId` or `side` covers all of them. It is absent while the switch is disabled.
