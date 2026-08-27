---
"@polyester/sdk": patch
---

Keep orderbook price buckets and sequence recovery correct by rounding asks upward, ignoring stale resets, stopping replay after a gap, and retrying failed snapshots.
