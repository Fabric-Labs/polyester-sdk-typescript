---
"@polyester/sdk": patch
---

`client.assistant.sendMessage` takes the `displaySettings` the client can change, and runs emit `display_setting_action` events asking the client to change one or show its choices. Available on devnet only.
