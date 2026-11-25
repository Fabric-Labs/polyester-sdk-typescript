---
"@polyester/sdk": patch
---

`client.swap` adds `cancel` to stop a running swap (`canceling` and `canceled` statuses, `user_canceled` reason, `canceled` slice reason and `cancelRequestedAt`) and `list` to page through an account's swaps newest first with an `openOnly` filter.
