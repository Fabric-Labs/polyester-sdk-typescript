# Polyester TypeScript SDK

TypeScript SDK for the Polyester public API.

Generated protobuf types and ConnectRPC service descriptors live in `src/gen/`.
The package root contains SDK entry points and helper APIs.

This SDK is maintained by Fabric Labs and updated as the public API evolves.

## Install

```bash
npm install @polyester/sdk
```

While the SDK is pre-1.0, compatible changes increment the patch version and
breaking changes increment the minor version. A consumer range such as
`^0.1.0` can update through `0.1.x` without crossing into breaking `0.2.x`
releases.

## Development

```bash
bun install --frozen-lockfile
bun run lint
bun run format:check
bun run check
bun run test
bun run build
bun run verify:package
```

Use `bun run dev` for rebuilds while editing.

Run `bun run changeset` when a change should be included in the next package
release. Generated protobuf updates must also run
`bun scripts/strip-descriptor-options.ts`; CI rejects a generated tree that is
not already stripped.

## Publishing

The `publish-polyester-sdk.yml` workflow maintains a Changesets release pull
request for changes merged into `main`. Merging that release pull request
publishes the stable version to npm's `latest` tag and creates the corresponding
GitHub release.

Package exports permanently target the built `dist` tree. `prepack` performs a
clean build, and CI verifies that every declared export exists before release.

Repository administrators must configure npm trusted publishing for the
`Fabric-Labs/polyester-sdk-typescript` repository and the
`publish-polyester-sdk.yml` workflow. Save a granular, package-scoped read-only
npm token as the GitHub Actions secret `NPM_READ_TOKEN`; publishing itself uses
OIDC rather than a write token. Grant the intended npm teams access to the
private package separately.
