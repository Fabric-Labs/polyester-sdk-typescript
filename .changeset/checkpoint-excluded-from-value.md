---
"@polyester/sdk": minor
---

Checkpoint asset amounts add `excludedFromValue`. When it is true, the asset is not account equity (for example a testnet faucet token): it is listed by amount only, `usd` is always absent, and it counts toward no USD total. A missing `usd` on such an asset is not a pricing gap. A response that gives such an asset a `usd` value is rejected with `ValidationError`.
