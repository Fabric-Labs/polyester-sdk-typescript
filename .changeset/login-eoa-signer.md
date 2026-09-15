---
"@polyester/sdk": patch
---

Declare the account signer's `ownerAddress` (the connected EOA) as the LOGIN challenge `signerAddress` instead of the Safe `accountAddress`, so wallet login and session refresh authenticate a Safe smart account with a distinct EOA signer. Subaccount creation challenges are unchanged.
