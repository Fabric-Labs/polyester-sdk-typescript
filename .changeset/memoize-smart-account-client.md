---
"@polyester/sdk": minor
---

Memoize `createPolyesterSmartAccountClient` per account and environment so the gas price cache and warmed connections survive across submissions. Creating a client for the same pair with different options now throws.
