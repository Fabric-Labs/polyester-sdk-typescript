---
"@polyester/sdk": minor
---

fix(policies): scale subaccount policy `maxOrderSize` to the quote microunits that `max_order_notional` expects. It is now a decimal USDT string on read and write, so a 100,000 USDT cap is `"100000"`, and `"0"` still means no cap.

It was previously a `number` written straight to the wire, so a cap of 100000 took effect as 0.1 USDT and small orders failed with `POLICY_MAX_NOTIONAL` (POLY-4796). Caps saved before this fix hold raw microunits and read back at their true value now, so re-set any that look a million times too small.
