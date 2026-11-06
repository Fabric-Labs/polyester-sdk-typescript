---
"@polyester/sdk": patch
---

`Checkpoint` now carries `openingValueUsd`, the season-end USD value of the holdings restored when the season opened (`"0"` when it opened with no balances, `undefined` when a restored balance had no USD value). With it, `seasonResultUsd` reconciles as `finalValueUsd - openingValueUsd - netInflowUsd`.
