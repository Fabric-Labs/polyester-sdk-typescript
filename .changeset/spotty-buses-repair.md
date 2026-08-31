---
"@polyester/sdk": patch
---

fix(triggers): enforce the 1 to 10,000 bps `maxSlippage` cap on standalone trigger create and modify, matching attached trailing stops and market IOC orders.
