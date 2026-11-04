---
"@polyester/sdk": minor
---

`trades.list` takes `symbolId` as a number, like every other symbol filter and like the `symbolId` on returned trades, orders and triggers. A string, `0`, negative or fractional `symbolId` is rejected. "symbolId is required when afterMatchId is set" now appears only when `afterMatchId` is set without `symbolId`.
