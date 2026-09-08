---
"@polyester/sdk": minor
---

feat(market-overview)!: expose `volume24hUsd` and preserve unavailable volumes in list and subscription responses. `volume24hBase` and `volume24hQuote` can now be `undefined` when scaled amounts overflow; `volume24hUsd` is `undefined` when reliable valuation is unavailable. Handle missing values separately from zero (`"0"`).
