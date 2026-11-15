---
"@polyester/sdk": patch
---

Inputs the SDK rejects before sending now throw `ValidationError`: a TWAP `durationMs` or `sliceIntervalMs` out of range and ladder `levels` outside 2 to 100 in `triggers.create`, an `afterMatchId`, `afterTradeId`, `startTsNs` or `endTsNs` filter that is not a positive integer, unknown keys in `orders.modify` and `orders.batchReplace` items, and a missing `accountId` in `orders.subscribe`. Messages are unchanged.
