---
"@polyester/sdk": minor
---

Replace the `create_subaccount` wallet challenge purpose with `subaccounts.createChallenge`, which returns the server-derived smart account address, salt nonce, and EIP-191 authorization; `auth.createSubaccount` now accepts a signer or a signer factory and an optional `ownerAddress`.
