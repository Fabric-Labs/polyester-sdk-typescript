---
"@polyester/sdk": patch
---

`candles.listIndexPrice` returns one page of a market's closed index price candles, newest first, each marked with its `source`: composite `reference` candles before the pair's listing and `index` candles after, both scaled by the pair's reference price scale.
