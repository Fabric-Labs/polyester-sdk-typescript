---
"@polyester/sdk": patch
---

`ValidationError` messages name the field that failed. When an input matches none of the shapes a method accepts, the message now comes from the closest shape and is prefixed with its path, such as `items.0.symbolId: Invalid key: Expected "symbolId" but received undefined` for `orders.batchCreate` with `symbolId` on the request instead of each item. Before, this was the generic `Invalid type: Expected Object but received Object`. The same applies to an unsupported `execution.clientRefPrice` on `orders.create`, and `triggers.create` now reports `sliceIntervalMs cannot exceed durationMs` for a TWAP. Messages that already name their field are unchanged.
