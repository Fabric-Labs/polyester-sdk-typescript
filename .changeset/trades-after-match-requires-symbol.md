---
"@polyester/sdk": minor
---

fix(trades)!: `trades.list()` input is now a discriminated union. Passing `afterMatchId` requires a positive `symbolId`, matching the backend's `after_match_requires_symbol` rule; violating it is a compile error and an SDK `ValidationError` instead of a 400.
