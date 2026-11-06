---
"@polyester/sdk": patch
---

`columnarTimestampSecAt` and `expandColumnarTimestampsSec` now place the last point at `endTsSec`, the last point's own timestamp, so columnar history timestamps (equity, portfolio equity, balance history, chain analytics, spot volume) are no longer drawn early and the last point is no longer one bucket early. Values are unchanged.
