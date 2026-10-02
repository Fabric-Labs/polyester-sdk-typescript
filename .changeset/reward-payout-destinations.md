---
"@polyester/sdk": patch
---

Add `rewards.setDestination` to record a write-once payout destination for an award owned by the authenticated root account. Pass the award's `fulfillmentRevision` as `expectedRevision` (a positive decimal string) and a client-generated `requestId` (1 through 128 characters, reused on retry); `awardId` accepts 1 through 128 characters and `destinationAddress` 1 through 512. Requires a session token and a fresh step-up proof via `stepUpToken`; it does not execute a transfer or mark the award delivered.
