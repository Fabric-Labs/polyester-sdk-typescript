---
"@polyester/sdk": patch
---

The smart account client polls for UserOperation receipts every second instead of every 4 seconds, configurable via the new `options.pollingIntervalMs` setting.
