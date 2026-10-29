---
"@polyester/sdk": minor
---

pr: #207

`orders.getDetails` returns `executionsComplete`. It is true once the trades across every page add up to the filled quantity; while it is false, read again for the rest.
