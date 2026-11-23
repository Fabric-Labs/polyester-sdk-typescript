---
"@polyester/sdk": patch
---

Reject unknown keys with `ValidationError` on `candles.list`, `candles.listColumnar`, `candles.listColumnarInts`, `marketData.listTrades`, `orderbook.get`, `heatmap.getOrderbookHeatmap`, and `accounts.resolve` instead of silently ignoring misspelled filters such as `startTime`/`endTime`. Validate `marketData.listTrades` input before awaiting catalog scale readiness.
