---
"@polyester/sdk": minor
---

Add a `fetch` option to the client config, `createPolyesterServerClientFromCookies`, and `createPolyesterServerClientFromRequest` for sending SDK HTTP requests through a custom fetch implementation. SDK auth, error mapping, and timestamp-skew detection still apply. Defaults to the global `fetch`.
