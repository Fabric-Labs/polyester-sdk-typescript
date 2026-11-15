---
"@polyester/sdk": patch
---

Catalog snapshots passed to `createPolyesterCatalog`, `catalog.setSnapshot` or `buildCatalogSnapshot` now refuse asset and pair scales (`quantityScale`, `marketDataVolumeScale`, `baseQuantityScale`, `quoteQuantityScale`, `referencePriceScale`) outside 0 to 18 with `ValidationError`, instead of hanging on the first formatted value.
