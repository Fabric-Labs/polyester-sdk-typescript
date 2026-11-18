---
"@polyester/sdk": patch
---

`client.assistant.setModelKey`, `getModelKey` and `deleteModelKey` save, read and delete the caller's own OpenAI API key, which then pays for their messages instead of credits. A run that OpenAI refuses the key for fails with category `model_key_refused`. Available on devnet only.
