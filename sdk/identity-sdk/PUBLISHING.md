# Publishing `@identity-protocol/identity-sdk`

## Monorepo development

Apps in this repo use `workspace:*` or `file:` links. Run `npm install` from the repo root.

## npm publish (external integrators)

1. Publish `@par-noir/oauth-ui` first (popup helpers used by `PNOAuthClient`).
2. From `sdk/identity-sdk`, ensure `package.json` dependencies use published versions of `@par-noir/oauth-ui` (not `file:`) before `npm publish`.
3. Build and publish:

```bash
cd packages/oauth-ui && npm run build && npm publish --access public
cd ../../sdk/identity-sdk && npm run build && npm test && npm publish --access public
```

Or use the root script:

```bash
./scripts/publish-integrator-packages.sh
```

## Bundled static assets

Third parties copy `static/oauth-callback.html` from this package into their `public/` directory. Keep in sync with `@par-noir/oauth-ui` static copy.
