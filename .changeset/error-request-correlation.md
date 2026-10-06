---
"@polyester/sdk": patch
---

Errors mapped from failed responses now carry `status`, `requestId` (the `x-request-id` response header, falling back to `cf-ray`), `cfRay`, and `polyesterEdge`, including realtime token request failures. Browsers only see these headers when the API exposes them via CORS.
