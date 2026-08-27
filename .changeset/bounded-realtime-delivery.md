---
"@polyester/sdk": patch
---

Bound catalog-readiness event queues, defer listeners added during an event until the next emission, and retry the lazy realtime transport import after a transient chunk-load failure.
