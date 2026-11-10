---
"@polyester/sdk": patch
---

`formatLedgerBalance` is now exported from the package root. It converts a `ledger.read.v1.AssetBalance` message to the `LedgerBalance` that `balances.list` returns. Its U128 amounts are always at the 18-decimal ledger scale, whatever the asset's own decimals, so callers holding these messages from other APIs no longer convert them by hand.
