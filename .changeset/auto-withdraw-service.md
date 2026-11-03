---
"@polyester/sdk": patch
---

Add `autoWithdraw`, the scheduled auto-withdraw service, also at `@polyester/sdk/services/auto-withdraw`: `getRule`, `setRule`, `disableRule` and `listRuns` for the active account, the root account (`account: "main"`) or a subaccount. Rules pay each asset in kind on an hourly, daily, weekly, biweekly or monthly UTC slot to destinations on the account's external withdraw whitelist. `setRule` and `disableRule` need a session login with withdraw rights and a fresh `stepUpToken`; missing step-up throws `StepUpRequiredError` or `SessionElevationRequiredError`, and a stale `expectedVersion` throws `RevisionConflictError`. Schedules are validated per cadence before sending. Amounts are decimal strings, times epoch milliseconds, and enums lowercase strings.
