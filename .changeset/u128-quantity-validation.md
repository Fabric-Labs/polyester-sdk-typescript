---
"@polyester/sdk": patch
---

A trading withdraw or internal transfer `quantity` too large for the 128-bit wire amount now throws `CatalogConversionError` (a `ValidationError`) naming `quantity`, instead of a plain `RangeError`.
