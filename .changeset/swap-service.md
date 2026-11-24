---
"@polyester/sdk": patch
---

`client.swap` quotes, creates and reads swaps that convert one asset of an account's Trading balance into another, on the direct market or through USDT or USDC, at market or as a TWAP. A `create` that fails with a retryable error may have run; resend the same input under the same `idempotencyKey` to get the same swap. Available on devnet only.
