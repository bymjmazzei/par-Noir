const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const multer = require('multer');
const path = require('path');

// Import metadata service
const { GoogleDriveMetadataService } = require('./GoogleDriveMetadataService');

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
    const { visibility = 'private', pnIdentifier, ownerDid, tags, description } = req.body;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    if (!pnIdentifier) {
      return res.status(400).json({ error: 'pnIdentifier is required' });
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
    const fileMetadata_resource = {
      name: fileName,
      parents: [folderId]
    };

    const media = {
      mimeType: file.mimetype,
      body: file.buffer
    };

    const uploadedFile = await drive.files.create({
      resource: fileMetadata_resource,
      media: media,
      fields: 'id,name,size,webViewLink'
    });

    // Create companion metadata file
    const companionMetadata = {
      fileId: fileId,
      googleDriveFileId: uploadedFile.data.id,
      fileName: fileName,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: parseInt(uploadedFile.data.size) || file.size,
      visibility: visibility,
      uploadedAt: new Date().toISOString(),
      owner: {
        did: ownerDid,
        identifier: pnIdentifier
      },
      tags: tags ? (typeof tags === 'string' ? JSON.parse(tags) : tags) : [],
      description: description || undefined,
      metadata: {}
    };

    try {
      await GoogleDriveMetadataService.createCompanionMetadataFile(
        drive,
        pnIdentifier,
        companionMetadata
      );
      console.log('✅ Companion metadata file created successfully');
    } catch (metadataError) {
      console.error('❌ Failed to create companion metadata file:', metadataError);
      // Don't fail the upload if metadata creation fails, but log the error
    }

    // If file is public, add to public index
    if (visibility === 'public') {
      try {
        await GoogleDriveMetadataService.updatePublicFileIndex(
          drive,
          pnIdentifier,
          companionMetadata
        );
        console.log('✅ Public file index updated successfully');
      } catch (indexError) {
        console.error('❌ Failed to update public file index:', indexError);
        // Don't fail the upload if index update fails, but log the error
      }
    }

    res.json({
      success: true,
      fileId: uploadedFile.data.id,
      fileName: uploadedFile.data.name,
      size: parseInt(uploadedFile.data.size) || 0,
      url: uploadedFile.data.webViewLink,
      cid: fileId, // Our internal ID
      visibility: visibility
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload file: ' + error.message });
  }
});

// 7. Update file visibility
app.patch('/api/google-drive/files/:userId/:fileId/visibility', async (req, res) => {
  try {
    const { userId, fileId } = req.params;
    const { visibility, pnIdentifier } = req.body;

    if (!visibility || !['private', 'public', 'friends'].includes(visibility)) {
      return res.status(400).json({ error: 'Invalid visibility value. Must be private, public, or friends' });
    }

    if (!pnIdentifier) {
      return res.status(400).json({ error: 'pnIdentifier is required' });
    }

    const tokens = userTokens.get(userId);
    if (!tokens) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    oauth2Client.setCredentials(tokens);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Get file metadata
    const file = await drive.files.get({
      fileId: fileId,
      fields: 'id,name,size,mimeType,createdTime,webViewLink'
    });

    // Get or create pN folder and metadata folder
    const pnFolderName = `par Noir - pn-${pnIdentifier}`;
    const pnFolderQuery = `name='${pnFolderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const pnFolderResponse = await drive.files.list({
      q: pnFolderQuery,
      fields: 'files(id,name)'
    });

    let pnFolderId;
    if (pnFolderResponse.data.files.length > 0) {
      pnFolderId = pnFolderResponse.data.files[0].id;
    } else {
      // Create pN folder
      const folderMetadata = {
        name: pnFolderName,
        mimeType: 'application/vnd.google-apps.folder'
      };
      const folder = await drive.files.create({
        resource: folderMetadata,
        fields: 'id'
      });
      pnFolderId = folder.data.id;
    }

    // Get or create _metadata folder
    const metadataFolderQuery = `name='_metadata' and '${pnFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const metadataFolderResponse = await drive.files.list({
      q: metadataFolderQuery,
      fields: 'files(id,name)'
    });

    let metadataFolderId;
    if (metadataFolderResponse.data.files.length > 0) {
      metadataFolderId = metadataFolderResponse.data.files[0].id;
    } else {
      // Create _metadata folder
      const folderMetadata = {
        name: '_metadata',
        mimeType: 'application/vnd.google-apps.folder',
        parents: [pnFolderId]
      };
      const folder = await drive.files.create({
        resource: folderMetadata,
        fields: 'id'
      });
      metadataFolderId = folder.data.id;
    }
    
    // Find companion metadata file
    const metadataFileName = `${fileId}.metadata.json`;
    const metadataFileQuery = `name='${metadataFileName}' and '${metadataFolderId}' in parents and trashed=false`;
    const metadataFileResponse = await drive.files.list({
      q: metadataFileQuery,
      fields: 'files(id)'
    });

    let companionMetadata;
    if (metadataFileResponse.data.files.length > 0) {
      // Download existing metadata
      const metadataDownload = await drive.files.get(
        { fileId: metadataFileResponse.data.files[0].id, alt: 'media' },
        { responseType: 'stream' }
      );

      companionMetadata = await new Promise((resolve, reject) => {
        let data = '';
        metadataDownload.data.on('data', (chunk) => {
          data += chunk.toString();
        });
        metadataDownload.data.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(error);
          }
        });
        metadataDownload.data.on('error', reject);
      });

      // Update visibility
      companionMetadata.visibility = visibility;

      // Update metadata file
      const metadataContent = JSON.stringify(companionMetadata, null, 2);
      const metadataBlob = Buffer.from(metadataContent, 'utf-8');

      await drive.files.update({
        fileId: metadataFileResponse.data.files[0].id,
        media: {
          mimeType: 'application/json',
          body: metadataBlob
        }
      });
    } else {
      // Create new metadata if it doesn't exist
      companionMetadata = {
        fileId: fileId,
        googleDriveFileId: fileId,
        fileName: file.data.name,
        originalName: file.data.name,
        mimeType: file.data.mimeType,
        size: parseInt(file.data.size) || 0,
        visibility: visibility,
        uploadedAt: file.data.createdTime || new Date().toISOString(),
        owner: {
          identifier: pnIdentifier
        },
        tags: [],
        metadata: {}
      };

      try {
        await GoogleDriveMetadataService.createCompanionMetadataFile(
          drive,
          pnIdentifier,
          companionMetadata
        );
        console.log('✅ Companion metadata file created successfully (visibility update)');
      } catch (metadataError) {
        console.error('❌ Failed to create companion metadata file (visibility update):', metadataError);
        // Continue - don't fail the visibility update if metadata creation fails
      }
    }

    // Update public index
    try {
      await GoogleDriveMetadataService.updatePublicFileIndex(
        drive,
        pnIdentifier,
        companionMetadata
      );
      console.log('✅ Public file index updated successfully (visibility update)');
    } catch (indexError) {
      console.error('❌ Failed to update public file index (visibility update):', indexError);
      // Continue - don't fail the visibility update if index update fails
    }

    res.json({
      success: true,
      visibility: visibility,
      fileId: fileId
    });
  } catch (error) {
    console.error('Update visibility error:', error);
    res.status(500).json({ error: 'Failed to update file visibility: ' + error.message });
  }
});

// 8. Delete file
app.delete('/api/google-drive/files/:userId/:fileId', async (req, res) => {
  try {
    const { userId, fileId } = req.params;
    const { pnIdentifier } = req.query; // Get pnIdentifier from query string
    
    const tokens = userTokens.get(userId);
    if (!tokens) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    oauth2Client.setCredentials(tokens);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Delete the file
    await drive.files.delete({ fileId });

    // Delete companion metadata file if pnIdentifier is provided
    if (pnIdentifier) {
      try {
        await GoogleDriveMetadataService.deleteCompanionMetadataFile(
          drive,
          pnIdentifier,
          fileId
        );
      } catch (metadataError) {
        console.warn('Failed to delete companion metadata:', metadataError);
        // Continue even if metadata deletion fails
      }
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Failed to delete file: ' + error.message });
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