---
"@polyester/sdk": patch
---

`triggers.createOco` and the `triggers.list` filter send `clientListId` unchanged, like the other SDKs, instead of trimming outer spaces, so `list({ clientListId })` finds an OCO whose ID has leading or trailing spaces.
