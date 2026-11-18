---
"@polyester/sdk": patch
---

`internalTransfers.getBatch({ requestId })` reads a batch's current status and every leg's state, for example to follow a batch that `batchCreate` returned as `processing`.
