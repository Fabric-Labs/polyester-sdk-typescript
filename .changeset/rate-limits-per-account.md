---
"@polyester/sdk": patch
---

Docs: trading placement, cancellation and read rate limits apply per account and are shared by all its API keys and sessions; in `getTradingLimits`, `apiKeyRules` enforces the per-key read rule alongside the account read limit while its placement and cancellation rules are informational.
