---
"@polyester/sdk": patch
---

`subaccounts.policies.create` and `update` reject a negative or fractional `maxOpenOrders` with a `ValidationError` before sending. They used to send it as 0 (no cap) or truncate it. 0, `null` and an omitted field still mean no cap.
