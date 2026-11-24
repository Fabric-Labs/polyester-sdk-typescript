---
"@polyester/sdk": patch
---

`internalTransfers.getBatch({ requestId })` reads a batch's current status and every leg's state, for example to follow a batch that `batchCreate` returned as `processing`. `getBatch({ idempotencyKey })` reads it by the key sent to `batchCreate` instead, so a caller whose answer was lost, or whose batch was refused before it got a `requestId`, can still learn the outcome.
