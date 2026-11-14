---
"@polyester/sdk": patch
---

Zipper chain variants carry `depositStatus` and `withdrawalStatus` (`normal` or `suspended`); treat `"unspecified"` or an absent value as not available. Older snapshots without them still validate.
