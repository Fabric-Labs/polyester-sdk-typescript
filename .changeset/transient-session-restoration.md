---
"@polyester/sdk": patch
---

Preserve authentication when session restoration fails because of a transient request or signer initialization error. Propagate these failures for retry while continuing to clear expired or backend-rejected sessions.
