---
"@polyester/sdk": patch
---

Social verification links Telegram accounts. `socialVerification.start({ provider: "telegram" })` returns an `actionUrl` that opens the Polyester bot with the code. Poll `get` until the status is `"awaiting_confirmation"`, show the account's `handle`, `displayName` and `providerUserId`, then call `confirm({ provider: "telegram", providerUserId })` with a fresh `stepUpToken` to link exactly that account. `unlink({ provider: "telegram" })` removes the link or cancels one in progress. `providerUserId` stays a decimal string. Telegram does not use `markReady`, and starting again while an account is linked fails until it is unlinked.
