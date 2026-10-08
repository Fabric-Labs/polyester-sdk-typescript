---
"@polyester/sdk": patch
---

`sendPolyesterUserOperation` throws `UserOperationAlreadyKnownError` (code `USER_OPERATION_ALREADY_KNOWN`, an `AlreadyExistsError` subclass) when the bundler answers "Already known", meaning the identical operation is already pending. Its `userOpHash` is that pending operation's hash: wait on its receipt instead of signing again. Previously this surfaced as a raw viem RPC error.
