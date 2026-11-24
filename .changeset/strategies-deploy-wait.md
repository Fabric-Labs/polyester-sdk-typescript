---
"@polyester/sdk": patch
---

Deploy statuses add `wait`, what a running deploy waits for from the user: `whitelist_required` gives the bot subaccount's `address` to add to the internal whitelist before calling `deployBot` again.
