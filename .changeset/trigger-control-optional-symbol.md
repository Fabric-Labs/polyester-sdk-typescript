---
"@polyester/sdk": minor
---

`triggers.modify` and `triggers.resume` no longer require `symbolId`. Omitted, it targets the trigger's own market; when set, it must be that market. An API key limited to specific markets must still pass it.
