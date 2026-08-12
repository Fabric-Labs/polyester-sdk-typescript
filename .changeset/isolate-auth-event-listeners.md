---
"@polyester/sdk": patch
---

Isolate synchronously thrown auth event listener errors so one failing listener cannot reject a completed auth operation or prevent later listeners from running.
