---
"@polyester/sdk": minor
---

Add `subaccounts.createChallenge`, which returns the server-derived smart account address, salt nonce, and EIP-191 authorization. `auth.createSubaccount` now uses it and accepts a signer or a signer factory plus an optional `ownerAddress`.
