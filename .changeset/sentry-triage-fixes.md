---
"@polyester/sdk": minor
---

Realtime `onError` contexts now always carry an `Error`. Server and websocket failures arrive as the new `RealtimeError` (code `REALTIME_ERROR`) with the Centrifugo code on `realtimeCode`, instead of plain `{ code, message }` objects. `retryable` is true for errors the realtime client is already retrying on its own, such as code 109 (token expired), so callers can skip reporting them. Snapshot failures keep their original typed SDK error.

Browser clients end the session and emit `loggedOut` when an authenticated RPC is rejected as unauthenticated with the current token, for example when the backend revoked it or the device clock lags. Rejections of a token that has since been replaced, and those arriving while a login or refresh is in flight, are ignored. `AccountSignerAuthService.handleRejectedToken` exposes the same check.

`PreparedTradingWithdraw` exposes the signed `deadline` and `isExpired()`, which turns true a minute before the deadline. Prepare again before resubmitting an expired withdraw, for example after a slow MFA enrollment.
