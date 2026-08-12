# Polyester TypeScript SDK

Typed client for the Polyester Exchange public API. Covers markets, orders,
balances, transfers, auth, and realtime streams over ConnectRPC.

Works in browsers, Node, Bun, and edge runtimes. ESM only.

## Install

```bash
npm install @polyester/sdk
```

## Browser

Polyester accounts are smart accounts, so you bring an owner wallet and the SDK
derives the account signer. Nothing gets deployed just to log in.

```ts
import { PolyesterBrowserClient, POLYESTER_TESTNET_ENVIRONMENT } from "@polyester/sdk";
import { createPolyesterAccountSigner } from "@polyester/sdk/account-signer";

const accountSigner = createPolyesterAccountSigner({
    environment: POLYESTER_TESTNET_ENVIRONMENT,
    owner,
});

const client = new PolyesterBrowserClient({
    environment: POLYESTER_TESTNET_ENVIRONMENT,
    accountSigner,
});

await client.auth.login({ provider: "turnkey" });

const { orders } = await client.orders.listOpen();
```

See [docs/browser-login.md](docs/browser-login.md) for how account identity and
owner metadata relate.

## Server

`createPolyesterServerClientFromRequest` reads the session cookies off an
incoming request. Useful for SSR loaders and route handlers.

```ts
import {
    createPolyesterServerClientFromRequest,
    POLYESTER_TESTNET_ENVIRONMENT,
} from "@polyester/sdk";

const client = createPolyesterServerClientFromRequest({
    request,
    environment: POLYESTER_TESTNET_ENVIRONMENT,
});

if (client.hasUsableBearerToken) {
    const me = await client.verifySession();
}
```

Framework cookie stores are accepted too. Await asynchronous helpers before
passing the store. For example, with current Next.js versions:

```ts
import { cookies } from "next/headers";
import {
    createPolyesterServerClientFromCookies,
    POLYESTER_TESTNET_ENVIRONMENT,
} from "@polyester/sdk";

const client = createPolyesterServerClientFromCookies({
    cookies: await cookies(),
    environment: POLYESTER_TESTNET_ENVIRONMENT,
});
```

This factory accepts a `Request`, a `{ [name]: value }` record, or a synchronous
`.get(name)` store that returns either the cookie value or an object containing
the value.

The `polyester_auth_token` bearer cookie is read independently from the
`polyester_session_3` cookie. The latter contains unsigned display data for UI
hydration; it is not proof of authentication. The backend still verifies the
bearer token and authorizes every call.

For machine clients, pass an Ed25519 API key provider instead of a cookie
session:

```ts
import { PolyesterClient, POLYESTER_TESTNET_ENVIRONMENT } from "@polyester/sdk";

const client = new PolyesterClient({
    environment: POLYESTER_TESTNET_ENVIRONMENT,
    auth: {
        kind: "api-key-ed25519",
        getKeyId: () => process.env.POLYESTER_API_KEY_ID ?? null,
        getSecretKey: () => secretKeyBytes,
    },
});
```

## Realtime

Subscriptions return their own unsubscribe function. No event emitter, no
cleanup bookkeeping.

```ts
const unsubscribe = client.orders.subscribe({
    accountId,
    onEvent: (order) => console.log(order.orderId, order.status),
    onError: (ctx) => console.warn(ctx.channel, ctx.error),
});
```

## Entry points

| Import                          | Contains                                        |
| ------------------------------- | ----------------------------------------------- |
| `@polyester/sdk`                | clients, environments, errors, types            |
| `@polyester/sdk/errors`         | error classes and codes on their own            |
| `@polyester/sdk/account-signer` | `createPolyesterAccountSigner`                  |
| `@polyester/sdk/smart-account`  | UserOperations and on-chain smart account calls |
| `@polyester/sdk/catalogs`       | symbol catalog and decimal scales               |
| `@polyester/sdk/server-session` | cookie parsing without the client graph         |
| `@polyester/sdk/unstable/gen`   | raw protobuf types and service descriptors      |

`account-signer` and `smart-account` are separate subpaths on purpose. Both pull
in a large viem graph, and keeping them out of the root barrel means the app
shell does not pay for them.

Anything under `unstable/` can change in a patch release.

## Errors

Every failure surfaces as a `PolyesterError` subclass with a stable `code`, so
you can branch without string matching.

```ts
import { StaleQuoteError, RateLimitError } from "@polyester/sdk/errors";

try {
    await client.orders.create(input);
} catch (error) {
    if (error instanceof StaleQuoteError) return refreshQuote();
    if (error instanceof RateLimitError) return backOff(error.retryAfterMs);
    throw error;
}
```

## Versioning

Pre-1.0, so the usual semver shift applies: patch bumps are compatible, minor
bumps can break. Pin with `^0.1.0` to ride `0.1.x` without jumping into `0.2.x`.

## Contributing

Setup, commands, and release process live in
[CONTRIBUTING.md](CONTRIBUTING.md). Security reports go to
[SECURITY.md](SECURITY.md), not the issue tracker.

Maintained by Fabric Labs and updated as the public API evolves.
