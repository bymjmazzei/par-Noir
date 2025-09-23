# Google Drive Storage Setup Guide

This guide will help you set up Google Drive integration for the par Noir Identity Protocol dashboard.

## ✅ What's New

- **Fresh Google Drive Service**: Completely rewritten with proper OAuth 2.0 implementation
- **Secure Authentication**: Uses `drive.file` scope for limited, secure access
- **File Management**: Upload, download, delete, and organize files
- **Modern UI**: Clean interface with grid/list views and search functionality
- **Error Handling**: Robust error handling and user feedback

## 🚀 Quick Setup

### 1. Google Cloud Console Setup

1. **Go to [Google Cloud Console](https://console.cloud.google.com/)**
2. **Create a new project** or select an existing one
3. **Enable the Google Drive API**:
   - Go to "APIs & Services" → "Library"
   - Search for "Google Drive API"
   - Click "Enable"

### 2. OAuth 2.0 Credentials

1. **Go to "APIs & Services" → "Credentials"**
2. **Click "Create Credentials" → "OAuth 2.0 Client IDs"**
3. **Configure the OAuth consent screen**:
   - Choose "External" user type
   - Fill in app name: "par Noir Identity Protocol"
   - Add your domain to authorized domains
   - Add scopes: `https://www.googleapis.com/auth/drive.file`

4. **Create OAuth 2.0 Client ID**:
   - Application type: "Web application"
   - Name: "par Noir Dashboard"
   - Authorized JavaScript origins: 
     - `http://localhost:3000` (for development)
     - `https://yourdomain.com` (for production)
   - Authorized redirect URIs:
     - `http://localhost:3000` (for development)
     - `https://yourdomain.com` (for production)

### 3. API Key Setup

1. **Go to "APIs & Services" → "Credentials"**
2. **Click "Create Credentials" → "API Key"**
3. **Restrict the API key**:
   - Application restrictions: "HTTP referrers"
   - Add your domains: `localhost:3000/*`, `yourdomain.com/*`
   - API restrictions: Select "Google Drive API"

### 4. Environment Variables

Add these to your `.env` file:

```bash
# Google Drive Configuration
REACT_APP_GOOGLE_DRIVE_CLIENT_ID=your-client-id-here
REACT_APP_GOOGLE_API_KEY=your-api-key-here
```

### 5. Test the Integration

1. **Start your development server**:
   ```bash
   npm start
   ```

2. **Navigate to the Storage tab** in your dashboard

3. **Click "Sign in to Google Drive"**

4. **Grant permissions** when prompted

5. **Test file operations**:
   - Upload a file
   - Download a file
   - Delete a file
   - Search files

## 🔒 Security Features

### OAuth 2.0 Scopes
- **`drive.file`**: Limited access to files created by or opened with your app
- **No full Drive access**: Users' privacy is protected
- **App-specific folder**: Files are stored in a dedicated app folder

### Authentication Flow
- **Secure token handling**: Access tokens are managed securely
- **Automatic refresh**: Tokens are refreshed automatically
- **Sign out capability**: Users can revoke access anytime

## 🎯 Features

### File Management
- ✅ **Upload files** with drag & drop support
- ✅ **Download files** with one click
- ✅ **Delete files** with confirmation
- ✅ **Search files** by name
- ✅ **Sort files** by name, date, or size
- ✅ **View modes** (grid/list)

### User Experience
- ✅ **Real-time progress** for uploads
- ✅ **Error handling** with user-friendly messages
- ✅ **Responsive design** for all devices
- ✅ **File type icons** for easy identification
- ✅ **File size formatting** (KB, MB, GB)

## 🛠️ Troubleshooting

### Common Issues

1. **"Failed to initialize Google Drive"**
   - Check your API key and Client ID
   - Ensure Google Drive API is enabled
   - Verify domain restrictions

2. **"Sign in failed"**
   - Check OAuth consent screen configuration
   - Verify authorized origins and redirect URIs
   - Ensure scopes are properly configured

3. **"Upload failed"**
   - Check file size limits (Google Drive has 5TB limit)
   - Verify user has sufficient storage space
   - Check network connectivity

### Debug Mode

Enable debug logging by adding to your `.env`:
```bash
REACT_APP_ENABLE_DEBUG_MODE=true
```

## 📋 API Limits

- **Quota**: 1,000 requests per 100 seconds per user
- **File size**: 5TB maximum per file
- **Storage**: 15GB free per Google account
- **Rate limits**: Applied per user, not per application

## 🔄 Migration from Old System

If you had the previous Google Drive integration:

1. **Old files are preserved** in your Google Drive
2. **New files** will be stored in the app-specific folder
3. **No data loss** - all existing files remain accessible
4. **Clean slate** - the new system starts fresh with better security

## 📞 Support

If you encounter issues:

1. **Check the browser console** for error messages
2. **Verify your Google Cloud Console** configuration
3. **Test with a different Google account**
4. **Check the network tab** for API call failures

## 🎉 Success!

Once configured, your users will be able to:
- Securely store identity documents
- Access files from any device
- Share files with trusted contacts
- Maintain full control over their data

The Google Drive integration provides a robust, secure, and user-friendly file storage solution for the par Noir Identity Protocol.
