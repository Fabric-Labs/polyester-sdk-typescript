---
"@polyester/sdk": minor
---

`orders.cancelAll` returns `listingStatus`. A retry with the same `requestId` returns `"not_retained_read_open_orders"` with an empty `cancelledOrders`, which does not mean nothing was canceled; read open orders instead.
