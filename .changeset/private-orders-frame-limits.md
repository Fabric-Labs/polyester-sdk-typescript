---
"@polyester/sdk": patch
---

Bound the private order stream's memory: frames over 4 MiB are dropped undecoded and the connection reconnects, and a snapshot staging more than 100,000 orders or 64 MiB ends its subscription with a `snapshot` error.
