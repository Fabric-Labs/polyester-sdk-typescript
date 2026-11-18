---
"@polyester/sdk": patch
---

`statementExports.cancel({ exportId })` stops a queued or processing export, which ends `canceled` and frees its place under the root account's limit of 5.
