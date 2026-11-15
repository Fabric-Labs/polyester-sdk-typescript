---
"@polyester/sdk": patch
---

The ledger catalog amount helpers (`amountScaledToDecimalString`, `amountScaledToDisplayString`, `decimalAmountToScaled`, `normalizeAmountInput` and `formatAmount`) throw `CatalogLookupError` for a ledger id missing from the catalog, instead of converting at scale 6. The `unknownLedgerAsset` and `unknownZipperAsset` fallbacks that `getAssetByLedgerId` returns now have a `quantityScale` and `quantityDisplayDecimals` of 0, so applying their scale leaves the amount unscaled.
