---
"@polyester/sdk": minor
---

Breaking: `subaccounts.get` leaves `policy` out when the sub-account has no policy attached, instead of returning a made-up read-only "Subaccount Policy". `policy` is now optional in the return type.
