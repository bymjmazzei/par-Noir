# par Noir Identity Dashboard

A decentralized identity management system built with React, TypeScript, and advanced cryptographic technologies.

## Features

- 🔐 **Decentralized Identity Management**: Self-sovereign identity with DID support
- 🛡️ **Advanced Security**: Quantum-resistant cryptography and zero-knowledge proofs
- 🔒 **Privacy-First**: Granular privacy controls and data minimization
- 🌐 **Cross-Platform**: Web + Capacitor mobile shells
- ⚡ **High Performance**: Code splitting and production Vite builds
- 🧪 **Automated testing**: Jest/Vitest unit suites + Playwright smokes on every push (see [docs/developer/TESTING.md](docs/developer/TESTING.md))

## Quick Start

```bash
# Install dependencies (repo root)
npm ci

# Start dashboard development server
npm run dev:dashboard

# Run unit tests (same set CI runs, minus E2E)
npm test

# E2E smokes (production build + Playwright chromium)
npm run test:e2e:smoke
npm run test:e2e:browser

# Production hosting deploy
./deploy.sh
```

## Architecture

par Noir is a monorepo: identity (L1) → dashboard (L2) → API (L3) → browser (L4) → third parties (L5). Shared logic lives in `packages/`, `core/`, and `sdk/`. Apps must not import each other.

## Documentation

- [Testing (local + CI)](docs/developer/TESTING.md)
- [Contributing](CONTRIBUTING.md)
- Architecture notes under `docs/architecture/`

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). PRs must keep [`.github/workflows/test.yml`](.github/workflows/test.yml) green.

## License

All Rights Reserved. This software is provided free of charge for personal and commercial use. 
See [LICENSE](./LICENSE) for full terms.
# Test deployment
