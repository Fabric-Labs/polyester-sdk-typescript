---
"@polyester/sdk": minor
---

Breaking: Trigger IDs are now opaque public IDs, like order IDs, and every existing trigger gets a new ID once: drop stored trigger IDs, list triggers again and restart trigger listings from the first page. A zero trigger ID is now rejected before it is sent.
