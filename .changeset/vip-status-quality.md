---
"@polyester/sdk": minor
---

pr: #206

VIP status adds `settledVolumeQuality` and `averageAopQuality`, each `{ status, incompleteHours }` with status `complete`, `price_unavailable` or `incomplete_history`. With `price_unavailable`, `settledVolume30dUsd` is a lower bound.
