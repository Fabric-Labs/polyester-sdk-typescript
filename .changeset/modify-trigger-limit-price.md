---
"@polyester/sdk": minor
---

pr: #206

Breaking: `triggers.modify` no longer takes `limitPrice`, because the backend rejects any change to a child's limit price. Cancel the trigger and create a new one instead.
