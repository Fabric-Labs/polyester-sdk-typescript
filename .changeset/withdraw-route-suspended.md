---
"@polyester/sdk": patch
---

Withdraw error details add `ROUTE_SUSPENDED` and auto-withdraw step reasons add `route_suspended` for a destination network whose withdrawals are suspended. Docs: while a Zipper route is `suspended`, do not send funds on it.
