---
"@polyester/sdk": patch
---

`marketOverview.list` filters markets server-side by `lastPrice`, `change24hBps` and `volume24hUsd`, each an inclusive `{ min?, max? }` range; a market must match every filter given.
