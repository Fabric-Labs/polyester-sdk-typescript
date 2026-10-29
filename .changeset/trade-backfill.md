---
"@polyester/sdk": minor
---

pr: #206

`marketData.listTrades` takes `afterTradeId` (a uint64 decimal string; start from `"0"`) to walk a symbol's trades oldest first with no gaps. The result then carries `backfill` with `completeThroughTradeId`, `nextAfterTradeId` and `epochEnds`. `afterTradeId` cannot be combined with `side`, `startTsNs`, `endTsNs` or `pageToken`.
