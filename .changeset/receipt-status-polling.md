---
"@polyester/sdk": minor
---

Add `waitForPolyesterUserOperationReceipt`, which polls `pimlico_getUserOperationStatus` at a 250ms default interval, fetches the receipt only once included, fails fast on `rejected` or `failed`, and keeps checking the chain for operations the bundler reports as `not_found`. The client default `pollingInterval` is now 250ms, so viem's built-in `waitForUserOperationReceipt` also polls four times as often.
