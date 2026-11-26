---
"@polyester/sdk": patch
---

`statementExports.create` takes a required `type`: `account_statement`, `ledger` or `balances`. A `balances` period that starts before the account history throws `STATEMENT_HISTORY_UNAVAILABLE`, and the error detail carries `historyAvailableFrom`.
