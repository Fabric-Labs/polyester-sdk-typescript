---
"@polyester/sdk": patch
---

Expose `SocialVerification.errorCode` (`"social_account_already_linked"`, `"unspecified"` when no typed failure applies) and map `AUTH_SOCIAL_ACCOUNT_ALREADY_LINKED` RPC failures to a non-retryable `AlreadyExistsError`. Treat an already-linked verification as final for the current account: direct the user to the Polyester account already linked to that social identity instead of restarting verification.
