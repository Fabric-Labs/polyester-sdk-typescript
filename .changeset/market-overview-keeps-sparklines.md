---
"@polyester/sdk": patch
---

`marketOverview.subscribe` keeps each market's sparklines from the snapshot when live updates arrive. The live channel carries no sparklines, so before every emitted row had `sparklines: []`, even with `includeSparklines` on (the default).
