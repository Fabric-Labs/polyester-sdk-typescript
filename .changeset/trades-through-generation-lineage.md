---
"@polyester/sdk": patch
---

Require `lineageId` when passing `throughGeneration` to `trades.list`. Combining `throughGeneration` with `orderId` or no execution scope now fails validation and type checking instead of reaching the backend.
