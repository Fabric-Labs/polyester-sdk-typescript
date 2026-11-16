---
"@polyester/sdk": minor
---

Breaking: `assistant.listKeys` takes an input before its request options. Pass `{ view: "full" }` to get each key's account name as `label`. Available on devnet only.
