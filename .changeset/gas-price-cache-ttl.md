---
"@polyester/sdk": patch
---

Raise the smart-account gas price cache TTL from 10s to 60s. `sendPolyesterUserOperation` clears the cache when submission fails after signing, and `waitForPolyesterUserOperationReceipt` clears it on a bundler `rejected` status.
