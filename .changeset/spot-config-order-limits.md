---
"@polyester/sdk": minor
---

Spot config pairs add `maxLimitQtyBase`, `maxMarketQtyBase` and `maxOrderNotionalQuote`, decimal strings that are absent when the pair has no maximum, and `maxOpenOrdersPerPair`. `SpotConfig` adds `maxOpenOrdersTotal`. The open-order counts are the venue's defaults for a typical account; an account may have a lower limit of its own. Catalog snapshots carry these fields, and older snapshots without them still validate.
