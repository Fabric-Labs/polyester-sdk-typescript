---
"@polyester/sdk": patch
---

An order's `attachedRisk.trailingStop` now carries `limitPrice`, the most its buy-back pays per unit, set when the order sells and `undefined` when it buys. Previously it was dropped, so a selling order's trailing stop read back and passed to `modifyOrder` lost its limit price and was rejected with a bad-price error.
