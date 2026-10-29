---
"@polyester/sdk": minor
---

Breaking: every order and trigger outcome-unknown code (`ORDER_CREATE_OUTCOME_UNKNOWN`, `ORDER_CANCEL_OUTCOME_UNKNOWN`, `ORDER_MODIFY_OUTCOME_UNKNOWN`, `TRIGGER_CREATE_OUTCOME_UNKNOWN` and `TRIGGER_CONTROL_OUTCOME_UNKNOWN`) now throws the new non-retryable `OutcomeUnknownError` instead of a retryable `TimeoutError`. The change may already have applied, so read the order by its client order ID, or list triggers by client trigger ID, before sending it again. `detail.code` names the operation. A deadline without one of these details is still a retryable `TimeoutError`.
