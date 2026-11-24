---
"@polyester/sdk": minor
---

Breaking: `marketData.getSpotConfig()` returns `tsSec` in Unix seconds, matching its name and the REST API. It was in milliseconds, and so was the catalog's market `tsSec`. Multiply by 1000 where you need a `Date`.
