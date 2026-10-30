---
"@polyester/sdk": minor
---

`OrderErrorCode` adds `MAX_OPEN_ORDERS_PER_PAIR`, and trigger failure reasons add `max_open_orders_per_pair`. Order error details add `existingOrderId`: on a `CONFLICT_DUPLICATE_CLIENT_ORDER_ID` rejection, it is the ID of the order that already holds the client order ID, when that order is known. Batch create rejections carry it too.
