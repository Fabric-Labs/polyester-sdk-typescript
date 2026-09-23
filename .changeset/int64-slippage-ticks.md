---
"@polyester/sdk": patch
---

Encode and decode absolute max-slippage ticks as int64 `bigint` values instead of int32 numbers. Absolute slippage inputs now accept values up to the int64 price ceiling, and `maxQuoteSlippage` on spot order constraints reports that ceiling instead of `2.147483647`.
