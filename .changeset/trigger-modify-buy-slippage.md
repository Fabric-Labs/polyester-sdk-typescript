---
"@polyester/sdk": patch
---

`triggers.modify()` accepts `maxSlippage: { kind: "bps", bps: 10000 }`, which a buy stop-loss or take-profit with a market child allows. It previously rejected anything above 9999 locally. The server still rejects 10000 for a sell stop-loss or take-profit and for trailing stops, with `ERROR_CODE_MAX_SLIPPAGE_INVALID`.
