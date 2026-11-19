---
"@polyester/sdk": patch
---

`orders.cancelAll` and `orders.cancelAllAfter` take `includeTriggers` to also stop the matching triggers, and `cancelAll` returns `matchedTriggers`.
