---
"@polyester/sdk": minor
---

Add tree-shakable client cores. `PolyesterCore`, `PolyesterBrowserCore`, and `PolyesterServerCore` (plus `createPolyesterServerCoreFromCookies`/`FromRequest`) wire transports, realtime, catalogs, and auth, and reach every other service through `@polyester/sdk/services/*` accessors such as `ordersService(core)`, so bundles only include the services they call. The full clients are unchanged and return the same instances as the accessors (`client.orders === ordersService(client)`).

Error-detail decoders and API-key signing now load on demand. SDK transports load decoders before mapping errors; call `loadErrorDetailDecoders(error)` before synchronously mapping a raw `ConnectError` that did not come through an SDK transport, or `loadErrorDetailDecoders()` to preload all of them.
