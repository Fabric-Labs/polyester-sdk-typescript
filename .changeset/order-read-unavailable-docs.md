---
"@polyester/sdk": patch
---

Document that `orders.getDetails()` can throw a retryable `ServiceUnavailableError` right after an accepted create, before the new order is readable: retry with the same `orderId` or `clientOrderId`, and treat only `null` as not found. `orders.listOpen()` and `orders.listHistory()` document the same error when an order's current state is briefly unavailable. Behavior is unchanged.
