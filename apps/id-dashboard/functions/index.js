const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { google } = require('googleapis');
const cors = require('cors')({ origin: true });

// Initialize Firebase Admin
admin.initializeApp();

// Simple in-memory token storage (for development)
const tokenStorage = new Map();

// Google OAuth configuration
const GOOGLE_CLIENT_ID = '43740774041-pcets3qets323k8p1e3aavbdphqpub06.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = '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';
const GOOGLE_REDIRECT_URI = 'https://us-central1-par-noir-dashboard.cloudfunctions.net/googleDriveAuthCallback';

// OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
);

// Get OAuth URL
exports.googleDriveAuthUrl = functions.https.onRequest((req, res) => {
  return cors(req, res, () => {
    try {
      const state = `state-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/drive'],
        prompt: 'consent',
        state: state
      });
      
      res.json({ authUrl });
    } catch (error) {
      console.error('Error generating auth URL:', error);
      res.status(500).json({ error: 'Failed to generate auth URL' });
    }
  });
});

// Handle OAuth callback
exports.googleDriveAuthCallback = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    try {
      const { code, state } = req.query;
      
      console.log('OAuth callback received:', { code: code ? 'present' : 'missing', state });
      
      if (!code) {
        console.error('No authorization code provided');
        return res.status(400).json({ error: 'No authorization code provided' });
      }

      // Exchange code for tokens
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      // Get user info
      const drive = google.drive({ version: 'v3', auth: oauth2Client });
      const userInfo = await drive.about.get({ fields: 'user' });
      
      const userId = userInfo.data.user.emailAddress;
      
      // Store tokens in memory instead of Firestore
      tokenStorage.set(userId, tokens);
      console.log('Tokens stored for userId:', userId);

      const frontendUrl = 'https://pn.parnoir.com';

      // Send success message to parent window
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Google Drive Authentication</title>
        </head>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'GOOGLE_AUTH_SUCCESS',
                user: '${userId}'
              }, '${frontendUrl}');
              window.close();
            } else {
              window.location.href = '${frontendUrl}?google-auth=success&user=${encodeURIComponent(userId)}';
            }
          </script>
          <p>Authentication successful! You can close this window.</p>
        </body>
        </html>
      `);
      
    } catch (error) {
      console.error('OAuth callback error:', error);
      const frontendUrl = 'https://pn.parnoir.com';
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Google Drive Authentication</title>
        </head>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'GOOGLE_AUTH_ERROR',
                error: 'Authentication failed'
              }, '${frontendUrl}');
              window.close();
            } else {
              window.location.href = '${frontendUrl}?google-auth=error';
            }
          </script>
          <p>Authentication failed! You can close this window.</p>
        </body>
        </html>
      `);
    }
  });
});

// Check authentication status
exports.googleDriveStatus = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    try {
      const { userId } = req.query;
      
      console.log('Status check request for userId:', userId);
      
      if (!userId) {
        console.log('No userId provided');
        return res.status(400).json({ error: 'User ID required' });
      }

      // Check in-memory storage instead of Firestore
      const tokens = tokenStorage.get(userId);
      
      if (!tokens) {
        console.log('No tokens found for userId:', userId);
        return res.json({ authenticated: false });
      }

      console.log('Tokens found for userId:', userId);
      
      res.json({ 
        authenticated: true,
        user: userId,
        hasRefreshToken: !!(tokens && tokens.refresh_token)
      });
    } catch (error) {
      console.error('Status check error:', error);
      console.error('Error details:', error.message, error.stack);
      res.status(500).json({ 
        error: 'Failed to check status',
        details: error.message 
      });
    }
  });
});

// Refresh access token
exports.googleDriveRefresh = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    try {
      const { userId } = req.body;
      
      if (!userId) {
        return res.status(400).json({ error: 'User ID required' });
      }

      // Get tokens from in-memory storage
      const tokens = tokenStorage.get(userId);
      
      if (!tokens) {
        return res.status(401).json({ error: 'No tokens found' });
      }
      
      if (!tokens.refresh_token) {
        return res.status(401).json({ error: 'No refresh token available' });
      }

      oauth2Client.setCredentials(tokens);
      const { credentials } = await oauth2Client.refreshAccessToken();
      
      // Update stored tokens in memory
      tokenStorage.set(userId, credentials);
      console.log('Tokens refreshed for userId:', userId);
      
      res.json({ 
        success: true,
        accessToken: credentials.access_token
      });
    } catch (error) {
      console.error('Token refresh error:', error);
      res.status(500).json({ error: 'Failed to refresh token' });
    }
  });
});

// List files
exports.googleDriveListFiles = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    try {
      const { userId } = req.query;
      
      if (!userId) {
        return res.status(400).json({ error: 'User ID required' });
      }

      // Get tokens from in-memory storage
      const tokens = tokenStorage.get(userId);
      
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
});

// Upload file
exports.googleDriveUpload = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    try {
      const { userId, fileData, fileName, mimeType } = req.body;
      
      if (!userId || !fileData || !fileName) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Get tokens from in-memory storage
      const tokens = tokenStorage.get(userId);
      
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
      const encryptedFileName = `pn-encrypted-${fileId}`;

      // Convert base64 to buffer
      const fileBuffer = Buffer.from(fileData, 'base64');

      // Upload file
      const fileMetadata = {
        name: encryptedFileName,
        parents: [folderId]
      };

      const media = {
        mimeType: mimeType || 'application/octet-stream',
        body: fileBuffer
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
        cid: fileId
      });

    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ error: 'Failed to upload file' });
    }
  });
});

// Delete file
exports.googleDriveDeleteFile = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    try {
      const { userId, fileId } = req.query;
      
      if (!userId || !fileId) {
        return res.status(400).json({ error: 'User ID and file ID required' });
      }

      // Get tokens from in-memory storage
      const tokens = tokenStorage.get(userId);
      
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
});

// Sign out
exports.googleDriveSignOut = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    try {
      const { userId } = req.body;
      
      if (!userId) {
        return res.status(400).json({ error: 'User ID required' });
      }

      // Remove tokens from in-memory storage
      tokenStorage.delete(userId);
      console.log('Tokens removed for userId:', userId);
      res.json({ success: true });
    } catch (error) {
      console.error('Sign out error:', error);
      res.status(500).json({ error: 'Failed to sign out' });
    }
  });
});
