---
"@polyester/sdk": patch
---

Order error details add `causeCode` and `levelIndex` on `LADDER_LEVEL_REJECTED`: the code the refused ladder order would return on its own and its zero-based index among the ladder's levels.
