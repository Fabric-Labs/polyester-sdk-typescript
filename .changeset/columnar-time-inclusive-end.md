---
"@polyester/sdk": patch
---

`expandColumnarTimestampsSec` and `columnarTimestampSecAt` now end at `endTsSec`, so the last columnar history point is no longer one bucket early.
