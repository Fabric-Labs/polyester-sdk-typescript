---
"@polyester/sdk": minor
---

Breaking: the holds list is removed. `ledgerReadPb` in `@polyester/sdk/unstable/gen` drops `LedgerReadService.ListHolds`, `ListHoldsRequest`, `ListHoldsResponse` and `HoldRow`. Read held amounts from each asset's `reserved` amount in `balances.list`.
