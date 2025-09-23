const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3002;

// Google OAuth configuration
const GOOGLE_CLIENT_ID = '43740774041-pcets3qets323k8p1e3aavbdphqpub06.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'your-client-secret-here';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'https://pn.parnoir.com/auth/google/callback';

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// Middleware
app.use(cors({
  origin: ['https://pn.parnoir.com', 'https://par-noir-dashboard.web.app'],
  credentials: true
}));
app.use(express.json());

// Store user tokens (in production, use a proper database)
const userTokens = new Map();

// OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
);

// Routes

// 1. Get OAuth URL
app.get('/api/google-drive/auth-url', (req, res) => {
  try {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/drive'],
      prompt: 'consent'
    });
    
    res.json({ authUrl });
  } catch (error) {
    console.error('Error generating auth URL:', error);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

// 2. Handle OAuth callback
app.get('/auth/google/callback', async (req, res) => {
  try {
    const { code } = req.query;
    
    if (!code) {
      return res.status(400).json({ error: 'No authorization code provided' });
    }

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const userInfo = await drive.about.get({ fields: 'user' });
    
    const userId = userInfo.data.user.emailAddress;
    userTokens.set(userId, tokens);

    // Redirect back to frontend with success
    res.redirect(`${process.env.FRONTEND_URL || 'https://pn.parnoir.com'}?google-auth=success&user=${encodeURIComponent(userId)}`);
    
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL || 'https://pn.parnoir.com'}?google-auth=error`);
  }
});

// 3. Check authentication status
app.get('/api/google-drive/status/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const tokens = userTokens.get(userId);
    
    if (!tokens) {
      return res.json({ authenticated: false });
    }

    res.json({ 
      authenticated: true,
      user: userId,
      hasRefreshToken: !!tokens.refresh_token
    });
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Failed to check status' });
  }
});

// 4. Refresh access token
app.post('/api/google-drive/refresh/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const tokens = userTokens.get(userId);
    
    if (!tokens || !tokens.refresh_token) {
      return res.status(401).json({ error: 'No refresh token available' });
    }

    oauth2Client.setCredentials(tokens);
    const { credentials } = await oauth2Client.refreshAccessToken();
    
    // Update stored tokens
    userTokens.set(userId, credentials);
    
    res.json({ 
      success: true,
      accessToken: credentials.access_token
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

// 5. List files
app.get('/api/google-drive/files/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const tokens = userTokens.get(userId);
    
    if (!tokens) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    oauth2Client.setCredentials(tokens);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Get or create pN folder
    const folderQuery = "name='par-noir-media' and mimeType='application/vnd.google-apps.folder' and trashed=false";
    const folderResponse = await drive.files.list({
      q: folderQuery,
      fields: 'files(id,name)'
    });

    let folderId = 'root';
    if (folderResponse.data.files.length > 0) {
      folderId = folderResponse.data.files[0].id;
    } else {
      // Create folder
      const folderMetadata = {
        name: 'par-noir-media',
        mimeType: 'application/vnd.google-apps.folder'
      };
      const folder = await drive.files.create({
        resource: folderMetadata,
        fields: 'id'
      });
      folderId = folder.data.id;
    }

    // List files in folder
    const filesResponse = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id,name,size,createdTime,webViewLink)'
    });

    const files = filesResponse.data.files.map(file => ({
      id: file.id,
      name: file.name,
      size: parseInt(file.size) || 0,
      createdAt: new Date(file.createdTime).toISOString(),
      url: file.webViewLink,
      type: 'google-drive'
    }));

    res.json({ files });
  } catch (error) {
    console.error('List files error:', error);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// 6. Upload file
app.post('/api/google-drive/upload/:userId', upload.single('file'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { visibility = 'private' } = req.body;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const tokens = userTokens.get(userId);
    if (!tokens) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    oauth2Client.setCredentials(tokens);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Get or create pN folder
    const folderQuery = "name='par-noir-media' and mimeType='application/vnd.google-apps.folder' and trashed=false";
    const folderResponse = await drive.files.list({
      q: folderQuery,
      fields: 'files(id,name)'
    });

    let folderId = 'root';
    if (folderResponse.data.files.length > 0) {
      folderId = folderResponse.data.files[0].id;
    } else {
      // Create folder
      const folderMetadata = {
        name: 'par-noir-media',
        mimeType: 'application/vnd.google-apps.folder'
      };
      const folder = await drive.files.create({
        resource: folderMetadata,
        fields: 'id'
      });
      folderId = folder.data.id;
    }

    // Generate unique file ID
    const fileId = `pn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const fileName = `pn-encrypted-${fileId}`;

    // Upload file
    const fileMetadata = {
      name: fileName,
      parents: [folderId]
    };

    const media = {
      mimeType: file.mimetype,
      body: file.buffer
    };

    const uploadedFile = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id,name,size,webViewLink'
    });

    res.json({
      success: true,
      fileId: uploadedFile.data.id,
      fileName: uploadedFile.data.name,
      size: parseInt(uploadedFile.data.size) || 0,
      url: uploadedFile.data.webViewLink,
      cid: fileId // Our internal ID
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// 7. Delete file
app.delete('/api/google-drive/files/:userId/:fileId', async (req, res) => {
  try {
    const { userId, fileId } = req.params;
    const tokens = userTokens.get(userId);
    
    if (!tokens) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    oauth2Client.setCredentials(tokens);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    await drive.files.delete({ fileId });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// 8. Sign out
app.post('/api/google-drive/signout/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    userTokens.delete(userId);
    res.json({ success: true });
  } catch (error) {
    console.error('Sign out error:', error);
    res.status(500).json({ error: 'Failed to sign out' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`Google Drive Proxy Server running on port ${PORT}`);
  console.log(`OAuth redirect URI: ${GOOGLE_REDIRECT_URI}`);
});

module.exports = app;