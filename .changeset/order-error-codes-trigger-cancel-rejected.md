---
"@polyester/sdk": minor
---

pr: #203

`OrderErrorCode` gains the new order validation, capacity, auction, trigger, TWAP, ladder, batch, and Quick Swap codes. Breaking: `TRIGGER_CANCEL_REJECTED` is removed; a refused trigger cancel now returns `TRIGGER_STATUS_INVALID` or `TRIGGER_NOT_MODIFIABLE`.
