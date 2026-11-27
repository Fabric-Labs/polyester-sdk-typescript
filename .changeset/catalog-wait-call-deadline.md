---
"@polyester/sdk": patch
---

`timeoutMs` and `signal` now cover the wait for the client catalog that order, balance, candle, trigger and other catalog-backed calls do first. A call whose deadline passes or whose signal aborts during a cold catalog load rejects right away and never sends its request; the backend gets only the time left. Other callers still share the catalog load.
