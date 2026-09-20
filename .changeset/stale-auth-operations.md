---
"@polyester/sdk": patch
---

Prevent superseded restoration, login, and refresh operations from clearing or overwriting a newer session. Superseded restores return `null`, and superseded logins reject with `AbortError`.
