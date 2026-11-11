---
"@polyester/sdk": patch
---

`rewards.acknowledgeAward({ awardId, revealed, deliverySeen })` records that the recipient revealed an award or saw a paid award's delivery, and reward awards add `revealedAt` and `deliverySeenAt`, absent until acknowledged. The marks are shared across sessions and devices, so gate reveal and delivery dialogs on them instead of per-device storage. Set at least one mark; `awardId` must be a UUID. Marks are independent, permanent and idempotent, so a failed call can be retried as is. `deliverySeen` on an award that is not paid fails the whole call with `PreconditionFailedError`. A fresh `listAwards` shows acknowledgements from other sessions even when `awardsMayChange` is false. `listAwards` now also accepts an API key scoped to the main account whose policy grants `read-rewards`.
