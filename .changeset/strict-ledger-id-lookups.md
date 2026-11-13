---
"@polyester/sdk": minor
---

Breaking: ledger asset ID lookups on `catalog.market`, `catalog.ledger` and `catalog.zipper` follow the same contract as every other catalog lookup. `getAssetByLedgerId()` and `getAsset({ ledgerId })` return `null` for an ID missing from the catalog, and `requireAssetByLedgerId()`, `requireAsset({ ledgerId })` and `ledger.requireSymbolByLedgerId()` throw `CatalogLookupError`. They previously returned the `unknownLedgerAsset` / `unknownZipperAsset` placeholder, whose made-up scale of 6 could be applied to a real amount. To keep showing a row whose asset the catalog does not know yet, fall back explicitly: `catalog.ledger.getAssetByLedgerId(id) ?? unknownLedgerAsset`, and never convert an amount with the placeholder's scale.
