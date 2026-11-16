---
"@polyester/sdk": patch
---

`socialVerification.unlink` unlinks X and Discord accounts as well as Telegram. Changing or unlinking a linked X or Discord account needs a `stepUpToken` and is allowed once per provider every 30 days: auth error details and verifications carry `retryAfter`, and verifications add the `social_account_cooldown` and `social_change_limit_reached` error codes.
