---
"@polyester/sdk": minor
---

Breaking: a refusal caused by the API key's policy now reads `API_KEY_SPOT_TRADE_DENY` (no Spot Trading Write on the key) or `API_KEY_POLICY_REQUIRED` (no policy on the key) instead of `POLICY_SPOT_TRADE_DENY`, which now means only the sub-account's policy. All three still surface as `PermissionError`; handle them together.
