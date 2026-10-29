---
"@polyester/sdk": minor
---

`orders.cancelAll` returns `cancelledOrders`: up to 200 `{ orderId, clientOrderId }` entries, oldest first. It also returns `totalCancelled`, and `truncated` when not every canceled order is listed.
