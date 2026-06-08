# Polyester TypeScript SDK

TypeScript SDK for the Polyester public API.

Generated protobuf types and ConnectRPC service descriptors live in `src/gen/`.
The package root contains SDK entry points and helper APIs.

This SDK is maintained by Fabric Labs and updated as the public API evolves.

## Install

Package publishing is not enabled yet. Until the first release, consume this
repository from GitHub or a local checkout.

## Development

```bash
bun install --frozen-lockfile
bun run hooks:install
bun run lint
bun run format:check
bun run check
bun run build
```

Use `bun run dev` for rebuilds while editing.

Run `bun run changeset` when a change should be included in the next package
release.
