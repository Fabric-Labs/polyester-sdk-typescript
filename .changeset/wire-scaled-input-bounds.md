---
"@polyester/sdk": minor
---

Reject decimal order and trigger inputs that exceed protobuf signed-integer bounds with `CatalogConversionError`. `getSpotOrderConstraints()` now exposes the derived `maxPrice`, `maxQtyBase`, `maxNotionalQuote`, and `maxQuoteSlippage` wire ceilings.
