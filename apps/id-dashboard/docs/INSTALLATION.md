# Identity Protocol Dashboard - Installation Guide

## 🚀 Quick Start

### For Users

1. **Visit the Dashboard**
   - Open your browser and navigate to the Identity Dashboard
   - The app will automatically detect if it can be installed

2. **Install the PWA**
   - Look for the install icon in your browser's address bar
   - Click "Install" when prompted
   - The app will be added to your home screen/desktop

3. **Start Using**
   - Open the installed app
   - Create your first identity or import an existing one
   - Set up recovery custodians for security

### For Developers

1. **Clone the Repository**
   ```bash
   git clone <repository-url>
   cd identity-protocol/apps/id-dashboard
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Start Development Server**
   ```bash
   npm run dev
   ```

4. **Build for Production**
   ```bash
   npm run build
   ```

## 📱 Platform-Specific Instructions

### Desktop Browsers

#### Chrome/Edge
1. Visit the dashboard in Chrome or Edge
2. Look for the install icon (📱) in the address bar
3. Click the install icon
4. Click "Install" in the prompt
5. The app will appear in your applications list

#### Firefox
1. Visit the dashboard in Firefox
2. Click the menu button (☰)
3. Click "Add to Home Screen"
4. Click "Add" to confirm
5. The app will be added to your home screen

#### Safari (macOS)
1. Visit the dashboard in Safari
2. Click "File" > "Add to Dock"
3. The app will appear in your Dock

### Mobile Devices

#### Android Chrome
1. Open the dashboard in Chrome
2. Tap the menu button (⋮)
3. Tap "Add to home screen"
4. Tap "Add"
5. The app will appear on your home screen

#### iOS Safari
1. Open the dashboard in Safari
2. Tap the Share button (📤)
3. Tap "Add to Home Screen"
4. Tap "Add"
5. The app will appear on your home screen

#### Android Firefox
1. Open the dashboard in Firefox
2. Tap the menu button (☰)
3. Tap "Add to Home Screen"
4. Tap "Add"
5. The app will appear on your home screen

## 🔧 Development Installation

### Prerequisites

- **Node.js 18+**: Download from [nodejs.org](https://nodejs.org/)
- **npm 8+**: Usually comes with Node.js
- **Git**: Download from [git-scm.com](https://git-scm.com/)

### Step-by-Step Setup

1. **Install Node.js**
   ```bash
   # Check if Node.js is installed
   node --version
   npm --version
   ```

2. **Clone the Project**
   ```bash
   git clone <repository-url>
   cd identity-protocol
   ```

3. **Install Dependencies**
   ```bash
   # Install root dependencies
   npm install
   
   # Install dashboard dependencies
   cd apps/id-dashboard
   npm install
   ```

4. **Start Development**
   ```bash
   # Start the development server
   npm run dev
   
   # The app will be available at http://localhost:3000
   ```

5. **Build for Production**
   ```bash
   # Create production build
   npm run build
   
   # The built files will be in the dist/ directory
   ```

## 🚀 Deployment

### Static Hosting Services

#### Firebase Hosting
1. **Setup Firebase**
   - Sign up at [firebase.google.com](https://firebase.google.com)
   - Create a new project
   - Install Firebase CLI: `npm install -g firebase-tools`

2. **Initialize and Deploy**
   ```bash
   firebase login
   firebase init hosting
   npm run deploy:firebase
   ```
   - Your app will be available at a Firebase URL

#### GitHub Pages
1. **Build the Project**
   ```bash
   cd apps/id-dashboard
   npm run build
   ```

2. **Deploy to GitHub Pages**
   ```bash
   # Add dist/ to git
   git add dist/
   git commit -m "Add built files"
   git push
   ```

3. **Enable GitHub Pages**
   - Go to repository settings
   - Enable GitHub Pages
   - Set source to `/docs` or `/root`

#### OrbitDB Hosting
1. **Install IPFS CLI**
   ```bash
   npm install -g ipfs-cli
   ```

2. **Initialize IPFS**
   ```bash
   ipfs init
   ipfs daemon
   ```

3. **Deploy**
   ```bash
   cd apps/id-dashboard
   npm run build
   ipfs add -r dist/
   ```

### Manual Deployment

1. **Build the Project**
   ```bash
   cd apps/id-dashboard
   npm run build
   ```

2. **Upload Files**
   - Upload the contents of `dist/` to your web server
   - Ensure HTTPS is enabled (required for PWA features)

3. **Configure Server**
   - Set up proper MIME types for `.js` and `.css` files
   - Enable gzip compression
   - Set up caching headers

## 🔒 Security Requirements

### HTTPS
- **Required**: PWA features require HTTPS
- **Service Workers**: Only work over HTTPS
- **Installation**: PWA installation requires HTTPS

### Content Security Policy
```html
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self'; 
               script-src 'self' 'unsafe-inline'; 
               style-src 'self' 'unsafe-inline';">
```

### Service Worker
- Must be served from the root directory
- Must be accessible at `/sw.js`
- Must be served over HTTPS

## 📊 Performance Optimization

### Build Optimization
```bash
# Analyze bundle size
npm run build
npx vite-bundle-analyzer dist/

# Optimize images
npm install -g imagemin-cli
imagemin public/icons/* --out-dir=public/icons/
```

### Caching Strategy
- **Static Assets**: Cache for 1 year
- **Service Worker**: Cache for 1 week
- **API Responses**: Cache for 1 hour

### Compression
```bash
# Enable gzip compression
npm install compression
```

## 🧪 Testing Installation

### Local Testing
```bash
# Start development server
npm run dev

# Test PWA features
# 1. Open Chrome DevTools
# 2. Go to Application tab
# 3. Check Service Workers
# 4. Check Manifest
# 5. Test installation
```

### Production Testing
```bash
# Build for production
npm run build

# Serve locally
npx serve dist/

# Test PWA features
# 1. Open in Chrome
# 2. Check installability
# 3. Test offline functionality
# 4. Verify service worker
```

## 🐛 Troubleshooting

### Common Issues

#### PWA Not Installable
- **Check HTTPS**: Ensure site is served over HTTPS
- **Verify Manifest**: Check manifest.json is valid
- **Check Icons**: Ensure icons are properly sized
- **Browser Support**: Use Chrome, Edge, or Firefox

#### Service Worker Not Registering
- **HTTPS Required**: Service workers need HTTPS
- **File Location**: Ensure sw.js is at root
- **Browser Support**: Check browser compatibility

#### Build Errors
- **Node Version**: Ensure Node.js 18+
- **Dependencies**: Run `npm install` again
- **Cache**: Clear npm cache with `npm cache clean --force`

#### Performance Issues
- **Bundle Size**: Check with `npm run build`
- **Lighthouse**: Run performance audit
- **Optimization**: Enable compression and caching

### Debug Commands
```bash
# Check Node.js version
node --version

# Check npm version
npm --version

# Clear npm cache
npm cache clean --force

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Check build output
npm run build
ls -la dist/
```

## 📚 Additional Resources

### Documentation
- [PWA Documentation](https://web.dev/progressive-web-apps/)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [Web App Manifest](https://developer.mozilla.org/en-US/docs/Web/Manifest)

### Tools
- [Lighthouse](https://developers.google.com/web/tools/lighthouse) - Performance auditing
- [PWA Builder](https://www.pwabuilder.com/) - PWA optimization
- [WebPageTest](https://www.webpagetest.org/) - Performance testing

### Support
- Check the troubleshooting section above
- Review the developer documentation
- Contact the development team

---

**Need Help?** Check the troubleshooting section or contact support. 