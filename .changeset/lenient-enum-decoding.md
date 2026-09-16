---
"@polyester/sdk": minor
---

Decode unknown proto enum values on read paths as `"unspecified"` instead of throwing a `ValidationError`. When the server adds a new enum member that this SDK build does not know, the affected field now degrades to `"unspecified"` and the rest of the payload stays readable. Public output unions are unchanged since they already included `"unspecified"`.
