# Deployment Guide

This document clarifies the deployment strategy for the Par Noir project.

## 🚀 Deployment Strategy

### Main Application (ID Dashboard)
- **Platform**: Firebase Hosting
- **URL**: [pn.parnoir.com](http://pn.parnoir.com)
- **Location**: `apps/id-dashboard/`
- **Configuration**: `apps/id-dashboard/firebase.json`

### Developer Portal & Documentation
- **Platform**: GitHub Pages
- **URL**: [parnoir.com](https://parnoir.com)
- **Location**: Root directory files
- **Configuration**: `.github/workflows/deploy-docs.yml`

## 📁 What Gets Deployed Where

### Firebase (Main App)
- React application (`apps/id-dashboard/`)
- User dashboard interface
- Identity management tools
- Authentication flows

### GitHub Pages (Developer Portal)
- Landing page (`index.html`)
- Developer portal (`developer-portal.html`)
- Technical whitepaper (`whitepaper.html`)
- Documentation (`docs/`)
- Branding assets (`branding/`)

## 🔧 Deployment Workflows

### Firebase Deployment
The main application is deployed via Firebase CLI:
```bash
cd apps/id-dashboard
npm run build
firebase deploy
```

### GitHub Pages Deployment
The developer portal is deployed automatically via GitHub Actions when:
- Documentation files are updated
- Landing page files are modified
- Branding assets are changed

## 🚫 Resolved Issues

### GitHub Pages Deployment Conflicts
- ❌ **Removed**: `deploy.yml` workflow that was trying to deploy the main app to GitHub Pages
- ✅ **Updated**: `deploy-docs.yml` workflow to only deploy developer portal and documentation
- ✅ **Clarified**: Deployment strategy in README and documentation

### Why This Setup?
1. **Main App**: Firebase provides better performance and features for the React application
2. **Developer Portal**: GitHub Pages is perfect for static documentation and landing pages
3. **Separation of Concerns**: Different deployment strategies for different types of content

## 🛠️ Local Development

### Main Application
```bash
cd apps/id-dashboard
npm run dev
```

### Developer Portal
```bash
# Serve the root directory files locally
npx serve .
```

## 📝 Notes

- The main application should **NOT** be deployed to GitHub Pages
- Only the developer portal and documentation should be on GitHub Pages
- Firebase handles the production React application
- This separation prevents deployment conflicts and provides optimal hosting for each type of content
