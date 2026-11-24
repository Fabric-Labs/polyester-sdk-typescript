---
"@polyester/sdk": patch
---

Market overview rows add `open24h`, `tradeCount24h`, `vwap24h`, `openUtcDay` and rolling `stats1h`, `stats4h` and `stats7d` (`open`, `high`, `low` and `changeBps`). An unknown open, and a window without one, is `undefined`; `change24hBps` is meaningful only while `open24h` is set.
