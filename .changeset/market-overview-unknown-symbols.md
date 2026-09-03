---
"@polyester/sdk": patch
---

fix(market-overview): skip rows whose symbolId the catalog cannot resolve instead of failing the whole `list()` result or `subscribe()` snapshot; `subscribe()` now accepts an optional `symbolIds` filter forwarded to its snapshot request.
