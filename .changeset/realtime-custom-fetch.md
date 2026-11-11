---
"@polyester/sdk": patch
---

Realtime token requests (`/v1/rt/token` and `/v1/rt/subscribe`) now go through the `fetch` passed to `PolyesterClient`, like every other SDK request. They used the global `fetch` before, so proxies, mocks and request logging never saw them. `RealtimeClient` takes the same optional `fetch`. Without one, both keep using the global `fetch`.
