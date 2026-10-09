---
"@polyester/sdk": patch
---

Fix raw `ConnectError`s surfacing as unhandled promise rejections when the backend or a proxy returns a non-Connect response (for example a gateway 502, a redirect, or an HTML page with status 200). The SDK now buffers those response bodies before Connect aborts the request.
