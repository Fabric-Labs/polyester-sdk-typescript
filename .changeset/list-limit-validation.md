---
"@polyester/sdk": patch
---

`orders.listOpen()`, `orders.listHistory()` and `transfers.list()` reject a `limit` that isn't an integer from 1 to 1000 with a `ValidationError`. A negative or fractional limit previously failed while encoding a binary request and surfaced as `InternalServerError`.
