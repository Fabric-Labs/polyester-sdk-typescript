---
"@polyester/sdk": patch
---

`orderbook.subscribe` on a symbol that does not exist now reports `ResourceNotFoundError` through `onError` instead of emitting an available, empty book.
