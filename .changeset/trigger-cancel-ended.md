---
"@polyester/sdk": patch
---

Canceling a trigger that has already ended, including a repeated cancel, now throws with code `TRIGGER_STATUS_INVALID`, or `TRIGGER_NOT_FOUND` after 60 seconds, instead of returning the canceled trigger: treat either as done.
