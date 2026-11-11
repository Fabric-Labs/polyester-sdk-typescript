---
"@polyester/sdk": patch
---

Asset configs from `marketData.getSpotConfig` and the catalog add `includedInEquity`. When it is `false`, balances of the asset are still reported but count for nothing in total equity. An absent value, from older servers or snapshots, means unknown, so it is never defaulted to `false`.
