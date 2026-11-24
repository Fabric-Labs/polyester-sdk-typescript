---
"@polyester/sdk": minor
---

Breaking: `candles.list` returns a `CandlePage` instead of `Candle[]`: the market's `candles`, its composite `reference` candles when `includeReference` is set (before, they were dropped), and `nextPageToken` for older candles. Read `page.candles` where you used the array.
