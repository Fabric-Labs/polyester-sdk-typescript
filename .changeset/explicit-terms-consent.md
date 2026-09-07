---
"@polyester/sdk": patch
---

Expose `auth.acceptTerms()` for explicit consent through an interactive JWT session and `Profile.currentTermsAccepted` on profile responses. Preserve the typed `AUTH_TERMS_NOT_ACCEPTED` error detail when provisioning requires consent. Login does not accept terms automatically; creating subaccounts, API keys, and deposit addresses requires current acceptance.
