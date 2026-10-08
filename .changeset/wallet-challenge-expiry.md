---
"@polyester/sdk": patch
---

Wallet login throws `WalletChallengeExpiredError` (a subclass of `AuthenticationError`), and subaccount creation throws `SubaccountChallengeInvalidError`, when the challenge expired before it was signed. The check uses the server clock, learned from the challenge's EIP-4361 `Issued At` or from a response `Date` header (which browsers can read only when the API exposes it via CORS), so a skewed device clock doesn't cause false expiries. The backend has no distinct code for an expired challenge, so its own rejection still maps to `AuthenticationError`.
