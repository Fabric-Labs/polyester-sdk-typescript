---
"@polyester/sdk": patch
---

Bound catalog-readiness event queues without leaving subscriptions silently connected after continuity loss, let snapshot-backed feeds own coalescing and recovery, defer listeners added during an event until the next emission, and retry the lazy realtime transport import after a transient chunk-load failure.
