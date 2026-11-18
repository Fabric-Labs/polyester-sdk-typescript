---
"@polyester/sdk": patch
---

A ledger transfer that is one leg of an internal transfer batch reads as type `internal_batch` instead of `unspecified`, and `transfers.list` accepts `internal_batch` as a `transferCode` filter.
