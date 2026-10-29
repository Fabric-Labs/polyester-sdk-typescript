---
"@polyester/sdk": patch
---

`tradingRateLimits.getConfig` and `vip.listTiers`, the public catalog reads, now use cacheable ConnectRPC GET.
