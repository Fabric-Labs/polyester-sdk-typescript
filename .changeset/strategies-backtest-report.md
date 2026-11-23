---
"@polyester/sdk": patch
---

Backtest reports add the low, base and high cost scenarios, the equity curve, held-back baselines and the whole window's largest fall, and their metrics add the Sharpe ratio, realized profit and loss and exact start and end equity. A bot that cannot be backtested ends as `not_backtestable` with a `notBacktestableReason`, which deploy proposals and the `NOT_BACKTESTABLE` error detail carry too.
