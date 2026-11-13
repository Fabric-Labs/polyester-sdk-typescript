---
"@polyester/sdk": minor
---

Breaking: `marketData.getSpotConfig()` returns `tsSec` in Unix seconds, as its name and the REST and Connect APIs say, and the catalog's `market.tsSec` follows. It previously held milliseconds (the wire seconds times 1000). Multiply by 1000 where you need a millisecond time.
