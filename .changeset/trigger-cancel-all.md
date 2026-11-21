---
"@polyester/sdk": patch
---

`triggers.cancelAll` cancels every trigger matching `symbolIds`, `side` and `triggerTypes` in one request, with the orders those triggers are working; other orders stay open, and `dryRun` returns the count only.
