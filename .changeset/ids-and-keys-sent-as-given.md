---
"@polyester/sdk": patch
---

Caller-chosen IDs and keys are sent exactly as given instead of trimmed: `triggers.create` `clientTriggerId` (an empty one is now refused), `statementExports.create` `idempotencyKey` (a padded key is refused by its pattern), and `dustConversion.create` / `get` `quoteId`, `idempotencyKey` and `conversionId`. `lifecycle.subscribeOpenFlows` uses the public all-accounts channel only when `accountId` is omitted, not when it is empty. `orders.subscribe` / `realtime.connectPrivateOrders` subscribe with the trimmed account ID they validate.
