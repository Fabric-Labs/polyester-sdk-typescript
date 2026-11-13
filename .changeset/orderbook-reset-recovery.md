---
"@polyester/sdk": patch
---

Order book subscriptions apply a delta only when it starts at the book's current sequence, and after a gap wait for the server's next reset instead of refetching snapshots.
