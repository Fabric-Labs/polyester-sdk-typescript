---
"@polyester/sdk": patch
---

An order book subscription whose snapshot fails with an error that isn't retried (such as a 500) now rebuilds the book from the server's next reset, instead of ignoring every later reset and delta until the socket reconnects.
