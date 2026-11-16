---
"@polyester/sdk": patch
---

`client.internalTransfers.batchCreate` submits up to 10 transfers under one idempotency key and one MFA check, and returns each leg's outcome.
