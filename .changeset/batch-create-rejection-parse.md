---
"@polyester/sdk": patch
---

fix: `orders.batchCreate()` no longer throws a `ValiError` when the server rejects an item without a structured error detail; the item is surfaced as `status: "rejected"` with `error` possibly undefined. Also documents that `orders.listOpen()` is paginated and must be drained via `nextPageToken`.
