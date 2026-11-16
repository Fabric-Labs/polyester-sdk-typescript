---
"@polyester/sdk": patch
---

`client.balances.exportStatement` returns one page of the account statement for a period as CSV: every balance movement with its fee and the balance after it, plus `completeThrough`, the time the statement covers up to. `exportStatementCsv` follows the pages and returns the whole statement with `completeThrough`; before `endTime`, the statement is partial.
