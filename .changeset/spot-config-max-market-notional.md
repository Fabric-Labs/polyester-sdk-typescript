---
"@polyester/sdk": minor
---

Spot config pairs add `maxMarketNotionalQuote`, the largest notional of one market order as a decimal string in quote units. A buy is valued at its protection price and a sell at its reference price, before slippage; an order above it is rejected with `MAX_NOTIONAL`. It is absent when the pair has no maximum, so treat absence as no cap. Catalog snapshots carry it, and older snapshots without it still validate. `OVERLOADED` order errors now mean the account already has its maximum order requests in flight; they still surface as a retryable `RateLimitError` with no `retryAfterMs`, so retry after an outstanding request completes.
