---
"@polyester/sdk": minor
---

`trades.list` takes `symbolId` as a number, like every other symbol filter and like the `symbolId` on returned trades, orders and triggers. A string `symbolId` is rejected with "symbolId must be a positive integer", and `0`, negative and fractional values are rejected. "symbolId is required when afterMatchId is set" now appears only when `afterMatchId` is set without `symbolId`.
