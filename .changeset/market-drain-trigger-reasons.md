---
"@polyester/sdk": patch
---

pr: #207

Trigger `cancelReason` adds `account_repair` and, for a disabled market, `pair_drain_trigger`, `pair_drain_twap`, `pair_drain_ladder` and `pair_drain_attached_leg`. Show the drain reasons as "market disabled", not as a user cancel. `failureReason` adds `index_price_unavailable` and `trigger_would_trigger_immediately`.
