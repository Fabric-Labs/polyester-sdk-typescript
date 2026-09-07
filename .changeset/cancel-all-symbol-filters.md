---
"@polyester/sdk": minor
---

feat(orders): replace `symbolId` with `symbolIds` in `orders.cancelAll()` to cancel orders across up to 100 symbols. Use `symbolIds: [id]` for one symbol; empty or omitted filters match all symbols.
