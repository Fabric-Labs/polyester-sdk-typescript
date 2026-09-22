---
"@polyester/sdk": patch
---

Expose `marketDataVolumeScale` on assets and `referencePriceScale` on pairs from spot config, and use them to decode candle volume, market-overview 24h base volume, and composite reference candle prices. Catalog snapshots without the new scales fall back to the asset quantity scale and the primary price scale.
