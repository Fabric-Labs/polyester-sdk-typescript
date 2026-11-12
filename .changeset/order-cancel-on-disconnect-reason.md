---
"@polyester/sdk": patch
---

Orders report the cancel reason `cancel_on_disconnect` when the trading WebSocket's cancel-on-disconnect canceled them, apart from `cancel_all_after`. These orders previously read `"unspecified"`.
