---
"@polyester/sdk": minor
---

Server clients can call the QuickSwap broker API through `client.quickSwap`: `quote`, `create`, `get` by swap ID and `lookup` by idempotency key, with typed terms, quotes, deposits, execution progress and withdrawals. QuickSwap is server-only: browser clients have no `quickSwap` getter, and the `@polyester/sdk/services/quickswap` accessor accepts server cores only.

Authenticate with the new `{ kind: "broker-api-key", key }` provider, which only server client configurations accept. The key is sent as a bearer token on QuickSwap requests and never to other services. A server client configured with it has no user session, so `verifySession()` returns `null`.

QuickSwap rejections expose a `quickswap` error detail with a stable `code`. `AMOUNT_OUT_OF_RANGE` carries the current `minDepositAmount` and `maxDepositAmount`, and `IDEMPOTENCY_CONFLICT` and `ADDRESS_UNAVAILABLE` carry the existing `swapId`.

Triggers canceled by self-trade prevention now report the cancel reason `self_trade_prevention`.
