---
"@polyester/sdk": patch
---

`triggers.createOco` creates an OCO, a take-profit and a stop-loss that share one reserved quantity the account already holds and cancel each other, and returns its `orderListId` with both legs' trigger IDs. `triggers.cancelOco({ orderListId })` cancels both legs.
