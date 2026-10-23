---
"@polyester/sdk": patch
---

Browser clients now confirm a backend session rejection with `me()` before ending the session, so one endpoint wrongly answering `unauthenticated` no longer signs the user out. When `me()` is also rejected, the session ends and `loggedOut` is emitted once. Concurrent rejections, including the confirming `me()` itself, share a single check. Rejections for a token that is no longer current (refreshed, replaced, or after logout), and requests sent without a token, are still ignored. `AccountSignerAuthService.handleRejectedToken` now returns a promise that settles when the check completes.
