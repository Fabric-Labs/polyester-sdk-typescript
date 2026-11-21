---
"@polyester/sdk": minor
---

`client.marketData.subscribePriceBand({ symbolId, onEvent })` streams a pair's live price band from `public:spot:market:price_band:{symbolId}:proto`, emitting the same `LivePriceBand` as `getPriceBand`. Each connection is seeded with `getPriceBand`, and only a newer band (by `epoch`, then `updateId`, then `asOfTsNs`) is emitted, so repeated, late and reconnect-replayed messages are dropped. An unknown band arrives as `state: "unknown"` with null prices, not as an error: when the seed is refused `PRICE_BAND_STALE` or `PRICE_BAND_UNKNOWN`, when the stream sends `UNKNOWN`, and when `validUntilMs` passes with no newer band, so a band other than `unknown` is current until the next event.
