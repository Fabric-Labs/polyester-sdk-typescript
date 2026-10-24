---
"@polyester/sdk": minor
---

`sendPolyesterUserOperation` throws `UserOperationSendTimeoutError` (code `USER_OPERATION_SEND_TIMEOUT`, not retryable) when `eth_sendUserOperation` times out after signing. The bundler may still have accepted the operation, so the error carries its deterministic `userOpHash`: wait on it with `waitForPolyesterUserOperationReceipt` instead of signing again. Bundler requests now time out after 30s instead of viem's 10s default.
