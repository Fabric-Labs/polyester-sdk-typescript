---
"@polyester/sdk": patch
---

feat(triggers): add `execution.maxSlippage` to market IOC TWAPs, accepting a decimal price delta or 1 to 10,000 basis points. The protection applies to each slice; omitting it uses the pair default.
