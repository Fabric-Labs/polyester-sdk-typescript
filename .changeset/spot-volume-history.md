---
"@polyester/sdk": patch
---

feat(market-overview): add `getSpotVolumeHistory()` for pair and total trailing-24h USD volume series as decimal strings. Accept up to 2,000 distinct `symbolIds`; empty or omitted filters select all pairs. The 97 samples overlap at 15-minute intervals and must not be summed as period volume.
