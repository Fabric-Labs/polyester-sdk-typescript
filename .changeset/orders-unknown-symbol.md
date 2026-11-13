---
"@polyester/sdk": minor
---

Breaking: `orders.listOpen()` and `orders.listHistory()` reject a page that holds an order on a symbol missing from the client catalog, such as a pair listed after the catalog loaded, with a `CatalogLookupError`, like `triggers.list()` and `trades.list()`. They previously left that order out of the page with no error. Refresh the catalog and read again. `orders.subscribe()` now reports such an order to `onError` as a `CatalogLookupError` instead of skipping it silently; the rest of the batch and the snapshot still arrive.
