---
"@polyester/sdk": patch
---

Expose `actionTaken` on batch replacement admission and status items so callers can distinguish successor replacements from cancel-only outcomes. Clarify single-order timeout reconciliation and the 15-minute batch-create replay window.
