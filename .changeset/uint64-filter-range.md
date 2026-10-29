---
"@polyester/sdk": patch
---

Uint64 decimal filters such as `startTsNs` now reject values above 18446744073709551615 with `ValidationError` instead of failing to encode.
