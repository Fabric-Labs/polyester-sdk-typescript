---
"@polyester/sdk": patch
---

`autoWithdraw.previewRun({ account })` shows what the next run would pay from the balances, prices and fees now: `status` (`will_pay`, `rolls_over`, `no_destination`, `paused` or `no_rule`), `nextRunAt`, `ruleVersion`, the self-set `pause`, `minUsdValue`, `computedAt`, and one entry per asset with `available`, `payable`, `heldBack`, `holdReason`, `minimum`, `valueUsd` with `pricedAt`, `networkFee` with `networkFeeSampledAt`, and `payableFrom`. Amounts are decimal strings and times epoch milliseconds. Unknown values are null, never zero, and an asset the rule pays nowhere has a null destination. The preview can change before `nextRunAt`. API keys with `read-auto-withdraw` can read it.
