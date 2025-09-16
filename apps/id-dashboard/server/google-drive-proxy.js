const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const FormData = require('form-data');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Allow large file uploads
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Google Drive API proxy endpoints
app.post('/api/google-drive/upload', async (req, res) => {
  try {
    const { accessToken, fileData, fileName, folderId } = req.body;
    
    if (!accessToken || !fileData || !fileName) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Convert base64 to buffer
    const fileBuffer = Buffer.from(fileData, 'base64');
    
    // Create FormData for multipart upload
    const formData = new FormData();
    formData.append('metadata', JSON.stringify({
      name: fileName,
      parents: [folderId || 'root']
    }));
    formData.append('file', fileBuffer, {
      filename: fileName,
      contentType: 'application/octet-stream'
    });

    // Upload to Google Drive
    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        ...formData.getHeaders()
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google Drive API error: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    res.json(result);

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/google-drive/files', async (req, res) => {
  try {
    const { accessToken, folderId } = req.query;
    
    if (!accessToken) {
      return res.status(400).json({ error: 'Missing access token' });
    }

    const query = folderId ? `'${folderId}' in parents` : '';
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,size,mimeType,createdTime,modifiedTime,webViewLink,thumbnailLink)`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google Drive API error: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    res.json(result);

  } catch (error) {
    console.error('List files error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/google-drive/files/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { accessToken } = req.query;
    
    if (!accessToken) {
      return res.status(400).json({ error: 'Missing access token' });
    }

    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google Drive API error: ${response.status} ${errorText}`);
    }

    res.json({ success: true });

  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/google-drive/folders', async (req, res) => {
  try {
    const { accessToken, folderName } = req.body;
    
    if (!accessToken || !folderName) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const response = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google Drive API error: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    res.json(result);

  } catch (error) {
    console.error('Create folder error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Google Drive proxy server running on port ${PORT}`);
});
