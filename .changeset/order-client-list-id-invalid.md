---
"@polyester/sdk": patch
---

Order error codes add `CLIENT_LIST_ID_INVALID`, which the server answers for a malformed OCO `clientListId` on `triggers.createOco` and the `triggers.list` filter.
