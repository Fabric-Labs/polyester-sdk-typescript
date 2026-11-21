---
"@polyester/sdk": minor
---

Breaking: `balances.subscribe` emits each `BalanceUpdate` of the balance stream, a Trading update at its (`tradingEpoch`, `tradingSequence`) position or a Funding update, instead of one asset row; `LedgerBalance` drops `tradingRevision` and `mergeLedgerBalances` is removed. `balances.getSnapshot` returns the balances with the position to seed the stream from.
