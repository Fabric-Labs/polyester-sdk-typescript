---
"@polyester/sdk": patch
---

Read the current JWT provider value for every realtime token request so additional subscribers cannot retain stale credentials after token rotation or logout.
