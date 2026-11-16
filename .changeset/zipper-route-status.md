---
"@polyester/sdk": patch
---

Zipper chain variants carry `depositStatus` and `withdrawalStatus` (`normal` or `suspended`); treat `"unspecified"` or an absent value as unknown, not as suspended. Older snapshots without them still validate.
