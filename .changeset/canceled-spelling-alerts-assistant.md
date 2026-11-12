---
"@polyester/sdk": minor
---

Breaking: price alert status and the assistant `run_failed` failure category now spell canceled `"canceled"` (was `"cancelled"`), matching orders, triggers and the rest of the SDK. This covers `PriceAlert["status"]`, the `priceAlerts.list` `statuses` filter and `AssistantFailureCategory`. There are no aliases: `"cancelled"` is now rejected as an input.
