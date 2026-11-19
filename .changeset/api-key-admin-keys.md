---
"@polyester/sdk": patch
---

`apiKeys.create` and `apiKeys.update` take `purpose: "admin"` to create or promote an admin key (and `"standard"` to demote one), and listed keys report `purpose: "admin"`. Admin keys need the owner's session with a fresh step-up proof.
