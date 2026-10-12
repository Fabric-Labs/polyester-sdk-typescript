---
"@polyester/sdk": patch
---

`waitForPolyesterUserOperationReceipt` throws `UserOperationNotExecutedError` (code `USER_OPERATION_NOT_EXECUTED`) instead of a plain `Error` when the bundler reports the operation `rejected` or `failed`. It carries `userOpHash` and `bundlerStatus`; either status means the operation was not executed and nothing moved. Both new UserOperation errors are exported from the root, `@polyester/sdk/errors`, and `@polyester/sdk/smart-account`.
