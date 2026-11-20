---
"@polyester/sdk": patch
---

`orders.getDetails` reads a refused batch replacement's successor (`symbolId` 0, placeholder terms) instead of failing a catalog lookup, and order errors add `MODIFY_APPLY_EXPIRED`.
