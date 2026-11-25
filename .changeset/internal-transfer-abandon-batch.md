---
"@polyester/sdk": patch
---

`internalTransfers.abandonBatch` abandons an unused batch idempotency key with terminal status `abandoned`, returns any batch already submitted under that key unchanged, and causes later `batchCreate` calls under the key to throw a non-retryable `PreconditionFailedError` (`IDEMPOTENCY_KEY_ABANDONED`).
