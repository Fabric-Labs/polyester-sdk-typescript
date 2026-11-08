---
"@polyester/sdk": patch
---

`lifecycle.listFlows` with an `accountSelector` now also returns the transfers the account received from other accounts, such as transfers from other users or subaccounts and reward payouts. Each row carries `participation`: `"owner"` for a flow the account owns, including a transfer it sent, and `"recipient"` for a received transfer. Rows are `"unspecified"` without an account selector and in flow detail and realtime updates. Pass `participation: "owner"` to keep the previous owner-only list or `"recipient"` for received transfers only. `participation` requires `accountSelector` and throws `ValidationError` without one. A `pageToken` now resumes only the request it came from, so change nothing but `limit` between pages.
