---
"@polyester/sdk": minor
---

Breaking: the `catalog.ledger` amount helpers (`amountScaledToDecimalString`, `amountScaledToDisplayString`, `decimalAmountToScaled`, `normalizeAmountInput` and `formatAmount`) throw `CatalogLookupError` for a ledger asset ID missing from the catalog. They previously converted it at a made-up scale of 6, so a scale-18 amount of `1.5e18` read as `1500000000000`.
