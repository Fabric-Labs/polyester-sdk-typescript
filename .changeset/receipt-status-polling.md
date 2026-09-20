---
"@polyester/sdk": minor
---

Add `waitForPolyesterUserOperationReceipt`, which polls `pimlico_getUserOperationStatus` at a 250ms default interval, fetches the receipt only once included, and fails fast on `rejected`, `failed`, or persistent `not_found`. The client default `pollingInterval` is now 250ms, so viem's built-in `waitForUserOperationReceipt` also polls four times as often.
