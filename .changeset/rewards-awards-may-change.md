---
"@polyester/sdk": patch
---

`rewards.listAwards` now returns `awardsMayChange`. It is `true` while a campaign can still publish awards or one of the account's awards is awaiting a destination, ready for payout, or failed and retryable. When it is `false`, polling cannot return new awards or award changes until a new campaign is created.
