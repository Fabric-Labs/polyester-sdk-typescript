---
"@polyester/sdk": patch
---

Normalize caller transport cancellations so `isAbortError` recognizes them, prevent pre-aborted requests from starting, and format cancellations as "Request canceled."
