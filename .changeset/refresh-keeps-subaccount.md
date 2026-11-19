---
"@polyester/sdk": patch
---

`auth.refreshSession()` keeps the account selected with `switchAccount` even when the display-session cookie can't be read (Node, Bun, workers, or a browser with cookies blocked). Before, the refresh fell back to the main account, so later calls without an explicit `account` ran on the main account.
