---
"@polyester/sdk": patch
---

`client.swap` wires the account Swap API (`swap.v1.SwapService`), which converts one asset of an account's Trading balance into another with immediate-or-cancel spot orders at the account's taker fee: `quote` prices a source amount with a `maxSlippageBps` and returns `minAmountOut` and `expiresAt`, `create` executes it under an `idempotencyKey`, and `get` reads a swap by `swapId` or `idempotencyKey` until `isTerminal`. Amounts are decimal strings. A `create` that fails with a retryable `TimeoutError`, `ServiceUnavailableError` or `NetworkError` may have run; resend the same input to get the same swap. Swap rejections carry a `swap` error detail: `IDEMPOTENCY_CONFLICT` (`AlreadyExistsError`) names the existing `swapId`, and `AMOUNT_OUT_OF_RANGE` (`ValidationError`) the current `minAmount` and `maxAmount`. API keys need the `swap` policy action and subaccount members the `swap` permission. Available on devnet only.
