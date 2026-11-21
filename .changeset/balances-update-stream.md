---
"@polyester/sdk": minor
---

Breaking: `balances.subscribe` keeps the account's balances exact from the new sequenced balance stream and emits the whole balance list after each change (a `snapshot` on every subscribe, then each complete Trading step and each newer Funding balance) instead of one asset row; it takes an optional `account` for the snapshot's scope. `LedgerBalance` drops `tradingRevision` and `mergeLedgerBalances` is removed. `balances.getSnapshot` returns the balances with their Trading position.
