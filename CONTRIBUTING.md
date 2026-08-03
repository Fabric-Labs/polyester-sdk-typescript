# Contributing

## Prerequisites

Bun and Node versions are pinned in `.bun-version` and `.node-version`. Use a
version manager that reads those files, or match them by hand.

```bash
bun install --frozen-lockfile
```

Do not regenerate the lockfile as a side effect of unrelated work.

## Commands

| Command | What it does |
| --- | --- |
| `bun run dev` | tsdown in watch mode |
| `bun run test` | vitest, single run |
| `bun run lint` | oxlint (`lint:fix` to autofix) |
| `bun run format` | oxfmt (`format:check` in CI) |
| `bun run check` | tsc, no emit, src plus scripts |
| `bun run build` | production build into `dist` |
| `bun run verify:package` | asserts every declared export resolves |
| `bun run ci` | all of the above in CI order |

Run `bun run ci` before opening a pull request. It is the same sequence GitHub
Actions runs, so a green local run means a green CI run.

## Generated code

Protobuf types and ConnectRPC descriptors live in `src/gen/` and are generated,
not hand written. After regenerating:

```bash
bun scripts/strip-descriptor-options.ts
```

CI reruns that script and fails if the tree changes, so an unstripped
`src/gen/` will block the pull request.

## Bundle discipline

The root barrel is load bearing. Anything imported into it lands in every
consumer's app shell, including consumers that only wanted a cookie name.

Two rules follow from that:

- Heavy graphs (viem ABIs, typed data, smart account plumbing) stay behind
  their own subpath export. Re-export their types from the root, never their
  values.
- Small leaf constants get re-exported from their leaf module rather than
  through a module that drags in the client.

Existing comments in `src/index.ts` explain the specific cases. If you add an
export, add the reasoning there too.

## Changesets

Any change that should ship to npm needs a changeset:

```bash
bun run changeset
```

Pick patch for compatible changes and minor for breaking ones, since the
package is still pre-1.0. Skip the changeset for pure repo chores like CI
config or docs that are not published.

## Pull requests

- One logical change per pull request.
- Commit subjects follow the existing log: `sdk(typescript): <imperative
  summary>`.
- Cover behavior changes with tests. Colocated `*.test.ts` next to the module.
- Update `docs/` when public usage changes.

## Releases

`publish-polyester-sdk.yml` keeps a Changesets release pull request open for
whatever has landed on `main`. Merging it publishes to the npm `latest` tag and
cuts the matching GitHub release. There is no manual `npm publish` step.

Package exports always point at built `dist` output. `prepack` does a clean
build and CI verifies the exports before anything ships.

## Repository setup

For administrators, one time:

- Enable npm trusted publishing for `Fabric-Labs/polyester-sdk-typescript`
  scoped to the `publish-polyester-sdk.yml` workflow. Publishing uses OIDC, so
  no write token is needed.
- Store a granular, package-scoped, read only npm token as the Actions secret
  `NPM_READ_TOKEN`.
- Grant npm team access to the private package separately.

## Security

Do not open issues for vulnerabilities. See [SECURITY.md](SECURITY.md).
