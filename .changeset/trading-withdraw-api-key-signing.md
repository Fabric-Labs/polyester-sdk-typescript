---
"@polyester/sdk": minor
---

Breaking: trading withdraws without a wallet signer are now signed by the client's API key, so `tradingWithdraws.createToFunding`, `createToExternalChain` and their `prepare*` variants work for API-key clients with no extra input. The `payloadSignature` input is removed: the SDK picked the nonce after the caller had signed, so a caller-supplied signature could never match. Without a wallet signer or API-key auth the call throws `ConfigurationError`, and an API-key withdraw that targets a subaccount throws `ValidationError` instead of silently withdrawing from the key's account. API-key withdraws now also sign again on `submit` when the deadline is near, like wallet withdraws.
