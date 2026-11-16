---
"@polyester/sdk": patch
---

`client.dustConversion` converts dust, Trading balances too small to trade, into one target asset: `listBalances` shows each balance's eligibility, `quote` prices a conversion for 30 seconds, `create` converts the quote, and `get` and `list` read conversions. API keys need the `convert-dust` policy action and subaccount members the `convert_dust` permission.
