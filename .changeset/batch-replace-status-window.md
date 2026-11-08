---
"@polyester/sdk": patch
---

The `orders.getBatchReplaceStatus` JSDoc now gives the 60-second status window. The status is readable as soon as `batchReplace` returns. Retry a `ServiceUnavailableError` with the same request within the window. A `ResourceNotFoundError` never means the replacement was rejected: reconcile the individual orders and never resubmit an accepted batch. An item's `updatedTsNs` can be a later recovery time, so it does not identify a refusal.
