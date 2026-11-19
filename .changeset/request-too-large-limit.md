---
"@polyester/sdk": patch
---

`RequestTooLargeError` carries the exceeded `limitBytes` in its `detail` when the server sends a `RequestErrorDetail`, whatever the message.
