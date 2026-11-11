---
"@polyester/sdk": patch
---

`Trigger.configuration` now includes `triggerPriceSource` for stop loss, take profit and trailing stop triggers, so `triggers.get` and `triggers.list` return the price source set at create.
