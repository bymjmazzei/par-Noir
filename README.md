# Par Noir - Sovereign Identity Protocol

A decentralized, user-owned identity ecosystem with local-first architecture and military-grade cryptography.

## 🚀 Deployment Strategy

- **Main Application**: Deployed via Firebase at [pn.parnoir.com](http://pn.parnoir.com)
- **Developer Portal & Documentation**: Deployed via GitHub Pages at [parnoir.com](https://parnoir.com)

## 📁 Project Structure

```
par-Noir/
├── apps/
│   └── id-dashboard/          # Main React application (Firebase deployment)
├── core/
│   └── identity-core/         # Core identity protocol library
├── sdk/
│   └── identity-sdk/          # JavaScript SDK for developers
├── docs/                      # Documentation (GitHub Pages)
├── index.html                 # Developer portal landing page (GitHub Pages)
├── developer-portal.html      # Developer tools (GitHub Pages)
└── whitepaper.html           # Technical whitepaper (GitHub Pages)
```

## 🛠️ Development

### Prerequisites
- Node.js >= 18.0.0
- npm >= 9.0.0

### Quick Start
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Run tests
npm test
```

### Available Scripts
- `npm run dev` - Start development server for dashboard
- `npm run build` - Build all packages
- `npm run test` - Run all tests
- `npm run lint` - Run linting
- `npm run security:audit` - Run security audit

## 🔧 Workspaces

This project uses npm workspaces for managing multiple packages:

- **Dashboard App** (`apps/id-dashboard/`) - Main user interface
- **Identity Core** (`core/identity-core/`) - Core protocol implementation
- **Identity SDK** (`sdk/identity-sdk/`) - Developer SDK

## 📚 Documentation

- [API Reference](docs/api/API_REFERENCE.md)
- [Developer Guide](docs/developer/DEVELOPER_GUIDE.md)
- [Security Overview](docs/security/SECURITY_OVERVIEW.md)
- [Deployment Guide](docs/deployment/DEPLOYMENT_GUIDE.md)

## 🔒 Security

Par Noir implements military-grade cryptography with:
- Zero-knowledge proofs
- Local-first architecture
- User-owned data
- Quantum-resistant algorithms

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## 📞 Support

- Documentation: [docs.parnoir.com](https://docs.parnoir.com)
- Issues: [GitHub Issues](https://github.com/parnoir/par-Noir/issues)
- Community: [Discord](https://discord.gg/parnoir) # Updated Sat Aug 30 09:24:29 PDT 2025
# Updated Sat Aug 30 11:42:17 PDT 2025
