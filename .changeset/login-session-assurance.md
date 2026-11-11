---
"@polyester/sdk": patch
---

`auth.login()` and `auth.refreshSession()` results now carry `session`, the issued token's assurance details (`sessionId`, `sessionLevel`, `authenticationMethods`, `authTimeMs`) in the same shape as `auth.me().session`. The wallet login response sent them, but the SDK dropped them. `session` is `undefined` when the response omits it.
