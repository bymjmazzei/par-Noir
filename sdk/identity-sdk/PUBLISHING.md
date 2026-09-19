# Publishing integrator packages

## Monorepo development

Apps in this repo use npm workspaces. Run `npm install` from the repo root. Workspace packages resolve by name even when `package.json` lists semver ranges (not `file:`).

## npm publish (external integrators)

Integrators install:

```bash
npm install @identity-protocol/identity-sdk @par-noir/oauth-ui
```

### Preflight

```bash
./scripts/publish-integrator-packages.sh
```

This script:

1. **Fails** if `@par-noir/oauth-ui` or `@identity-protocol/identity-sdk` still list `file:` dependencies.
2. Builds and tests the publish graph.
3. Prints the ordered `npm publish` commands (does not publish by itself).

### Publish order

1. Leaf packages: `user-owned-storage`, `pqc-crypto`, `device-cloud-credentials`, `aggregator-domain`, `zk-protocol-v1`, `zk-protocol-v2`, `identity-core`
2. `@par-noir/oauth-ui`
3. `@identity-protocol/identity-sdk`

Requires npm auth and `--access public` for scoped packages.

## Bundled static assets

Third parties copy `static/oauth-callback.html` from `@par-noir/oauth-ui` into their `public/` directory.

## Embed helpers

- `buildMessagingEmbedUrl` → `messaging.parnoir.com/embed`
- `buildFeedEmbedUrl` → `browse.parnoir.com/embed/feed`
