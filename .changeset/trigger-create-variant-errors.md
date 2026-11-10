---
"@polyester/sdk": patch
---

`triggers.create()` validation errors name the field missing from the trigger type you chose, e.g. `durationMs` for a TWAP or `triggerPrice` for a take-profit. They previously said `triggerType: Expected "stop_loss"` for every type except stop-loss. An unknown `triggerType` now says which values are allowed.
