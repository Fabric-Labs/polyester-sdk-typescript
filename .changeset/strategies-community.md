---
"@polyester/sdk": patch
---

`strategies` adds `publishVersion` and `unpublish` for a strategy's community listing, from the user's own session, and `listCommunity` and `getCommunity` to browse and read public listings with their platform backtest, without credentials. Strategies add their `listing`, and `LISTING_CAP_REACHED` carries a `listingCap` detail.
