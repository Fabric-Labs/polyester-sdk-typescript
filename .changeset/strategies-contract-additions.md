---
"@polyester/sdk": patch
---

Bot templates add their `moneyCard`, strategies add their `markets` and notes `summary`, bots add their last 24 hours of `activity`, `getVersion` returns the stored `validation`, and `listBotLogs` returns a `followToken` and `deployedAgain`. Deploys add the `setting_access` step, bots the `unrecorded_order` pause reason, and `BACKTEST_LIMIT_REACHED` a `backtestLimit` detail, without `retryAfter` for the limit on backtests at once.
