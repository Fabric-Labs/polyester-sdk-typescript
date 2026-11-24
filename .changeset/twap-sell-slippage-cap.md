---
"@polyester/sdk": patch
---

`triggers.create` rejects a sell TWAP whose market slices cap slippage at 10000 bps before sending it. A sell TWAP takes 1 to 9999 bps, as the server requires; a buy still takes up to 10000.
