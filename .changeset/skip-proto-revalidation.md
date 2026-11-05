---
"@polyester/sdk": patch
---

Order, trade, market trade, balance and candle streams (and their list reads) no longer re-validate protobuf-decoded messages with Valibot before formatting them. Payloads are unchanged; per-message formatting is roughly 1.5-2.5x faster.
