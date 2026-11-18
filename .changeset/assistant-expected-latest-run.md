---
"@polyester/sdk": patch
---

`client.assistant.sendMessage` takes `expectedLatestRunId` to send only while that run is still the conversation's latest; otherwise nothing is recorded and the call fails with `CONVERSATION_ADVANCED`. Available on devnet only.
