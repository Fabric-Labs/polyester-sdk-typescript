---
"@polyester/sdk": patch
---

`client.profitAndLoss` wires the profit and loss API (`pnl.v1.ProfitAndLossService`): `get` returns PnL over a `window` (`today`, `days_7`, `days_30`, `lifetime`) by product and market with current holdings, `listDaily` lists PnL per UTC day with start and end equity and net flow, and `getTradingStatistics` returns trade count, volume, fees and realized PnL with the return, maximum drawdown and Sharpe ratio. USD amounts are decimal strings, and a figure that needs an unavailable price is `null` with a `notices` entry saying why. API keys need the `read-pnl` policy action.
