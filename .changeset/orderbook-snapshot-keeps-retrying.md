---
"@polyester/sdk": patch
---

An order book subscription keeps asking for the snapshot while `GetOrderBook` answers that the book is not available yet (backoff from 1 s up to 8 s), and shows the book as soon as it is ready. Before, it stopped after three tries and stayed empty until the socket reconnected. A non-retryable snapshot error is not retried.
