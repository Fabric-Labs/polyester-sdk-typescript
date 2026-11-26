---
"@polyester/sdk": patch
---

Adds `strategies.reportCommunity`, which reports a community listing to moderation from the user's own session. Listings add the `held` state with the author-only `holdReason`, and a held listing throws `LISTING_HELD`.
