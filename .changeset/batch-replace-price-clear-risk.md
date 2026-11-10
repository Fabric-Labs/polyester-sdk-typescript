---
"@polyester/sdk": patch
---

`orders.batchReplace` now accepts a `newPrice` or `newQty` change together with `clearRisk: true` in the same item, matching `orders.modify`. Previously the SDK rejected the combination before sending it.
