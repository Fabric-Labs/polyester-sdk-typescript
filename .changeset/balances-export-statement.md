---
"@polyester/sdk": patch
---

`client.balances.exportStatement` returns one page of the account statement for a period as CSV: every balance movement with its fee and the balance after it. `exportStatementCsv` follows the pages and returns the whole statement.
