---
"@polyester/sdk": patch
---

Spot config pairs and the catalog add an optional `priceBand` (`lowerBps`, `upperBps`, `referenceWindowMs`), absent when the pair has no band, and orders report the cancel reason `price_band` when the band stopped a market order. Older snapshots without it still validate.
