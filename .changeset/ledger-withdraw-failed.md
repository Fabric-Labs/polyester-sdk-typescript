---
"@polyester/sdk": patch
---

Ledger transfer types add `withdraw_failed`, funds that left the account for a withdrawal that was rejected or failed to execute, in `transfers.list` rows and filters, `transfers.subscribe` and order transfer legs. These rows previously decoded as `"unspecified"`. The withdrawal fee is not refunded.
