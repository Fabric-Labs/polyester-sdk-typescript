---
"@polyester/sdk": minor
---

Breaking: order, trigger and trade reads no longer drop or fail on a pair listed after the client loaded its catalog. When a result names a symbol the catalog lacks, the SDK refreshes the catalog and formats it again; misses within 30 seconds share one refresh. A symbol still unknown after that throws `CatalogLookupError`. Before, `orders.listOpen`, `orders.listHistory` and `orders.subscribe` silently skipped those orders. This covers `orders.listOpen`, `orders.listHistory`, `orders.getDetails`, `triggers.get`, `triggers.list`, `triggers.listEvents`, `triggers.fromProto` and `trades.list`. On `orders.subscribe`, `triggers.subscribe`, `triggers.subscribeEvents` and `trades.subscribe`, such an event arrives through `onEvent` once the catalog refreshes, after the events around it, or reaches `onError` as a `CatalogLookupError`. An order held back from a snapshot this way arrives through `onEvent` even when `onSnapshot` is set.
