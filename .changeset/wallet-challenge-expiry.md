---
"@polyester/sdk": patch
---

Wallet login throws `WalletChallengeExpiredError` (a subclass of `AuthenticationError`), and subaccount creation throws `SubaccountChallengeInvalidError`, when the challenge expired before it was signed. The check runs only once the server clock is known from a response `Date` header; backend rejections of expired wallet challenges still map to `AuthenticationError`.
