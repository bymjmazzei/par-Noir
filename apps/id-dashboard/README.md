# Par Noir Dashboard

A modern, decentralized identity management dashboard built with React, TypeScript, and Tailwind CSS.

## 🚀 Features

- **Local-First PN Management** - Create and manage PNs locally
- **Layer 2 Tool Integration** - Connect Security, Storage, Monetization, and Browser tools
- **Privacy Controls** - Granular data sharing and privacy settings
- **Import/Export** - Backup and restore your PNs
- **Audit Logging** - Complete activity tracking
- **Responsive Design** - Works on desktop and mobile

## 🛠️ Development

### Prerequisites

- Node.js 16+ 
- npm 8+

### Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 🚀 Deployment

### Firebase Hosting (Recommended)

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Deploy to Firebase
npm run deploy:firebase
```

### Option 3: Manual Deployment

```bash
# Build the project
npm run build

# Upload the `dist` folder to your hosting provider
```

## 📁 Project Structure

```
src/
├── App.tsx              # Main application component
├── main.tsx             # Application entry point
├── index.css            # Global styles
└── components/          # Reusable components
```

## 🔧 Configuration

The dashboard is configured for:

- **Static Hosting** - Works with any static file host
- **SPA Routing** - Client-side routing with fallback
- **Security Headers** - XSS protection and content security
- **Performance** - Optimized builds with code splitting

## 🛡️ Security

- **Local Storage** - All data stored locally in browser
- **No Server Required** - Client-side only application
- **Privacy First** - User controls all data sharing
- **Audit Trail** - Complete activity logging

## 📱 Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+ 