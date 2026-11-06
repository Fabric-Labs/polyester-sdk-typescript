---
"@polyester/sdk": patch
---

The `orders.batchCreate` JSDoc now gives the batch's 15-minute idempotency window. It previously said 60 seconds, which is the `batchReplace` window. Within 15 minutes, a retry with the same `requestId` and payload returns each decided item's original result and retries the unresolved ones. After that the ID is free, and a repeat can place its orders again.
