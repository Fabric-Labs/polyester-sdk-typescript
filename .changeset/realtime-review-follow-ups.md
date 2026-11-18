---
"@polyester/sdk": patch
---

The order book stops retrying its snapshot once `realtime.disconnect()` closes the socket. `lifecycle.subscribeOpenFlows` trims a padded `accountId` again, and a `null` `accountId` throws instead of opening the public all-accounts channel. A `ServiceUnavailableError` from a gateway that only says "service temporarily unavailable" now carries `retryAfterMs` from `Retry-After`.
