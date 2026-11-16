---
"@polyester/sdk": patch
---

`triggers.createOco` and the `triggers.list` filter check `clientListId` with the same rule as `clientOrderId` (1 to 36 letters, digits, `.`, `_`, `:`, `/` or `-`) and send it unchanged instead of trimming it, like the other SDKs. An ID with spaces or other characters is refused with `ValidationError` before the request.
