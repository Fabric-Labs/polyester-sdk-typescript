---
"@polyester/sdk": patch
---

`balances.getBalanceHistory` series and `balances.getPortfolioEquitySnapshot` asset balances read the exact 18-decimal balances the server now returns, instead of values rounded to 7 decimals. Requires the server release that ships them.
