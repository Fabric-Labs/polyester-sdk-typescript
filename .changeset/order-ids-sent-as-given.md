---
"@polyester/sdk": patch
---

Order `clientOrderId` / `newClientOrderId` and order `requestId` are sent exactly as given instead of trimmed. A padded or blank ID now throws `ValidationError` before sending, so an order is never placed under a different ID than the caller holds, or with none. This covers `orders.create`, `batchCreate`, `modify`, `batchReplace`, `cancel`, `batchCancel`, `cancelAll`, `cancelAllAfter` and `getDetails`. An omitted ID behaves as before.
