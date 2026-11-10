---
"@polyester/sdk": patch
---

`internalTransfers.create()` results now carry `status`: `"accepted"`, `"rejected"`, `"failed"`, or `"unspecified"` for a value this SDK version doesn't know. The response field was previously dropped. Rejected and failed transfers, such as insufficient funds or a missing step-up, still raise errors rather than returning a result.
