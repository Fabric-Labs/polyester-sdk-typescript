---
"@polyester/sdk": minor
---

Breaking: order, trigger and trade reads no longer drop or fail on a pair listed after the client loaded its catalog. When a result names a symbol the catalog lacks, the SDK refreshes the catalog and formats it again; misses within 30 seconds share one refresh. A symbol still unknown after that throws `CatalogLookupError`. Before, `orders.listOpen`, `orders.listHistory` and `orders.subscribe` silently skipped those orders. This covers `orders.listOpen`, `orders.listHistory`, `orders.getDetails`, `triggers.get`, `triggers.list`, `triggers.fromProto` and `trades.list`. On `orders.subscribe`, `triggers.subscribe` and `trades.subscribe`, a publication naming such a symbol waits for the refresh, and later publications wait behind it, so callbacks keep their order; an order still unknown then reaches `onError` as a `CatalogLookupError` and is left out of `onSnapshot`.
