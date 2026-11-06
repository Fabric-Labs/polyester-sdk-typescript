---
"@polyester/sdk": patch
---

`PolyesterErrorCode` now includes `"SUBACCOUNT_CHALLENGE_INVALID"`, the code `SubaccountChallengeInvalidError` already carries, so an exhaustive `switch` over the union covers it.
