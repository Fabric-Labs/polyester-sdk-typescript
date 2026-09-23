---
"@polyester/sdk": patch
---

Encode and decode trading prices, price deltas, and slippage ticks at scale 9 instead of 6. Price inputs now accept up to nine decimal places, and absolute max-slippage values are capped at `2.147483647` quote units by the int32 wire field.
