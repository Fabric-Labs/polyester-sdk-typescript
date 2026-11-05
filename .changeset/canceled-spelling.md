---
"@polyester/sdk": minor
---

**Breaking:** every SDK label, key and filter value now uses the `canceled` spelling. Trigger status (output and the `triggers.list` `status` filter), sub-account invite status and social-verification status change from `"cancelled"` to `"canceled"`, matching order status and trigger events. The `orders.cancelAll` result renames `cancelledOrders` to `canceledOrders` and `totalCancelled` to `totalCanceled`. There are no aliases: update any code that compares against `"cancelled"` or reads the old keys.
