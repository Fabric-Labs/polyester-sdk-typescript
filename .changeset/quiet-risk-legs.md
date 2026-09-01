---
"@polyester/sdk": patch
---

Omit attached-risk legs whose only content is a `not_configured` runtime state, so consumers do not mistake absent risk configuration for a configured leg.
