---
"@polyester/sdk": patch
---

The `orders.batchReplace` JSDoc now explains back-to-back refreshes. The receipt answers admission, before each admitted change completes, so the next refresh of the same order can be rejected with the retryable item code `ORDER_MODIFY_IN_PROGRESS`, or `ORDER_PLACEMENT_PENDING` when it names the returned `replacementOrderId`. Resend only those items in a new batch under a fresh `requestId` after a short jittered backoff. Never resend admitted items, and never resend a batch whose outcome you did not receive under a new `requestId`.
