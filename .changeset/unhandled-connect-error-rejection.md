---
"@polyester/sdk": patch
---

Fix raw `ConnectError`s surfacing as unhandled promise rejections when the backend returns a non-Connect error response (for example a gateway 502). The SDK now buffers error response bodies before Connect aborts the request.
