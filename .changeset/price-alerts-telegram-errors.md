---
"@polyester/sdk": patch
---

`priceAlerts.create` and `update` throw `PreconditionFailedError` with the alerts detail `TELEGRAM_NOT_LINKED` when the `telegram` channel is asked for without a linked Telegram account, and `TELEGRAM_UNAVAILABLE` where Telegram delivery is not available. Neither is retryable.
