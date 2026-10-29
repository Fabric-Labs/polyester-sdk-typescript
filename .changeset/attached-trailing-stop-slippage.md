---
"@polyester/sdk": patch
---

Attached trailing stops now take 1 to 9999 bps `maxSlippage` on either side. The trailing stop of a sell order previously accepted 10000, which the backend now rejects.
