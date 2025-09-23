# Google Drive Proxy Server

This is the Google Drive integration proxy server for par Noir, providing secure OAuth authentication and file management capabilities.

## Features

- 🔐 Google OAuth 2.0 authentication
- 📁 File upload/download to Google Drive
- 🔒 Secure token management
- 🌐 CORS-enabled for web applications
- 📊 Health monitoring endpoints
- 🚀 Production-ready deployment

## Quick Start

### Development Mode

```bash
# Install dependencies
npm install

# Start development server
./deploy-dev.sh
```

### Production Deployment

```bash
# Deploy with PM2 and systemd
./deploy.sh
```

## Configuration

### Environment Variables

Create a `.env` file with the following variables:

```env
# Server Configuration
NODE_ENV=production
PORT=3002

# Google OAuth Configuration
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3002/auth/google/callback

# Frontend Configuration
FRONTEND_URL=http://localhost:5173

# Security
CORS_ORIGIN=http://localhost:5173,https://pn.parnoir.com
```

### Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the Google Drive API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URIs:
   - `http://localhost:3002/auth/google/callback` (development)
   - `https://yourdomain.com/auth/google/callback` (production)

## API Endpoints

### Authentication

- `GET /api/google-drive/auth-url` - Get OAuth authorization URL
- `GET /auth/google/callback` - OAuth callback handler
- `GET /api/google-drive/status/:userId` - Check authentication status
- `POST /api/google-drive/refresh/:userId` - Refresh access token
- `POST /api/google-drive/signout/:userId` - Sign out user

### File Management

- `GET /api/google-drive/files/:userId` - List user's files
- `POST /api/google-drive/upload/:userId` - Upload file
- `DELETE /api/google-drive/files/:userId/:fileId` - Delete file

### Monitoring

- `GET /health` - Health check endpoint

## File Structure

```
server/
├── google-drive-proxy.js    # Main server file
├── package.json             # Dependencies
├── deploy.sh               # Production deployment script
├── deploy-dev.sh           # Development deployment script
├── ecosystem.config.js     # PM2 configuration
├── .env                    # Environment variables
└── logs/                   # Log files
```

## Security Features

- ✅ CORS protection
- ✅ File size limits (100MB)
- ✅ Secure token storage
- ✅ Input validation
- ✅ Error handling
- ✅ Rate limiting ready

## Deployment

### Development

```bash
./deploy-dev.sh
```

### Production

```bash
./deploy.sh
```

The production deployment script will:
- Install dependencies
- Create systemd service
- Setup PM2 process management
- Configure logging
- Enable auto-restart

### PM2 Management

```bash
# View logs
pm2 logs par-noir-gdrive-proxy

# Restart service
pm2 restart par-noir-gdrive-proxy

# Stop service
pm2 stop par-noir-gdrive-proxy

# View status
pm2 status
```

### Systemd Management

```bash
# Check status
sudo systemctl status par-noir-gdrive-proxy

# Start service
sudo systemctl start par-noir-gdrive-proxy

# Stop service
sudo systemctl stop par-noir-gdrive-proxy

# Restart service
sudo systemctl restart par-noir-gdrive-proxy
```

## Troubleshooting

### Common Issues

1. **Port already in use**
   ```bash
   lsof -ti:3002 | xargs kill -9
   ```

2. **Missing dependencies**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

3. **OAuth errors**
   - Check Google Cloud Console configuration
   - Verify redirect URIs
   - Ensure API is enabled

4. **CORS errors**
   - Update CORS_ORIGIN in .env
   - Check frontend URL configuration

### Logs

- PM2 logs: `pm2 logs par-noir-gdrive-proxy`
- Systemd logs: `sudo journalctl -u par-noir-gdrive-proxy -f`
- Application logs: `./logs/combined.log`

## Integration with par Noir

This server integrates with the par Noir dashboard to provide:

- Secure file storage in Google Drive
- Encrypted file uploads with pN branding
- User-specific folder organization
- Seamless OAuth flow
- Cross-origin resource sharing

## Support

For issues or questions:
1. Check the logs
2. Verify configuration
3. Test endpoints manually
4. Review Google Cloud Console settings

---

**par Noir** - Digital Identity Management Platform
