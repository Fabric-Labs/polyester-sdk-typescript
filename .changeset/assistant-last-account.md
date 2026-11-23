---
"@polyester/sdk": patch
---

`assistant.listConversations` and `assistant.listMessages` return `lastAccount`, the account the conversation's latest message selected, as `accountSelection` and `subaccountId` to pass back to `sendMessage`.
