---
"@polyester/sdk": patch
---

Market data errors carry a `market_data` error detail with the error `code` (`BAD_REQUEST`, `INVALID_ARGUMENT`, `UNKNOWN_SYMBOL`, `NOT_FOUND` or `PAGE_TOKEN_INVALID`) and a readable `reason`, which stays the error message. On `PAGE_TOKEN_INVALID` from a candle read, drop the page token and request the first page again.
