---
"@polyester/sdk": patch
---

`triggers.batchCancel({ triggerIds })` cancels 1 to 50 triggers in one request and answers each, in order, as `accepted` or `rejected` with a `code`. A `requestId` is generated when omitted; retry a timed-out batch with the same one.
