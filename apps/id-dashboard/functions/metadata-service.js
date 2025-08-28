const functions = require('firebase-functions');
const fetch = require('node-fetch');

// IPFS MFS service for pN metadata storage
class MetadataService {
  constructor() {
    // Use Pinata IPFS with your API key
    this.ipfsUrl = process.env.IPFS_NODE_URL || 'https://api.pinata.cloud';
    this.pinataApiKey = process.env.PINATA_API_KEY || '950c8f37317d5ebaae77';
    this.pinataSecretKey = process.env.PINATA_SECRET_KEY || functions.config().pinata?.secret_key || 'your-pinata-secret-key';
    this.isInitialized = true;
  }

  async initialize() {
    // Already initialized
    return;
  }

  async updatePNMetadata(pnId, metadata) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Create metadata object with timestamp
      const metadataObject = {
        pnId,
        ...metadata,
        updatedAt: new Date().toISOString(),
        version: Date.now()
      };

      // Convert to JSON
      const metadataJson = JSON.stringify(metadataObject, null, 2);
      const metadataBuffer = Buffer.from(metadataJson, 'utf8');

      // Add to IPFS using Pinata API
      const formData = new FormData();
      formData.append('file', new Blob([metadataBuffer]), 'metadata.json');
      
      const response = await fetch(`${this.ipfsUrl}/pinning/pinFileToIPFS`, {
        method: 'POST',
        headers: {
          'pinata_api_key': this.pinataApiKey,
          'pinata_secret_api_key': this.pinataSecretKey
        },
        body: formData
      });
      
      const result = await response.json();
      const cid = result.Hash;

      // Store the CID in a mapping file for easy lookup
      await this.updateMetadataIndex(pnId, cid);

      return {
        success: true,
        cid: cid,
        metadata: metadataObject,
        ipfsUrl: `https://ipfs.io/ipfs/${cid}`
      };
    } catch (error) {
      console.error('❌ Failed to update pN metadata:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getPNMetadata(pnId) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Get the CID from the index
      const index = await this.getMetadataIndex();
      const cid = index[pnId];

      if (!cid) {
        return {
          success: false,
          error: 'Metadata not found'
        };
      }

      // Get the metadata from IPFS using Pinata gateway
      const response = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`);
      const metadataBuffer = await response.buffer();
      const metadata = JSON.parse(metadataBuffer.toString());

      return {
        success: true,
        metadata: metadata,
        cid: cid,
        ipfsUrl: `https://ipfs.io/ipfs/${cid}`
      };
    } catch (error) {
      console.error('❌ Failed to get pN metadata:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getAllPNMetadata() {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Get the index
      const index = await this.getMetadataIndex();
      const results = [];

      // Get all metadata
      for (const [pnId, cid] of Object.entries(index)) {
        try {
          const response = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`);
          const metadataBuffer = await response.buffer();
          const metadata = JSON.parse(metadataBuffer.toString());
          results.push(metadata);
        } catch (error) {
          console.error(`Failed to get metadata for ${pnId}:`, error);
        }
      }

      return {
        success: true,
        metadata: results
      };
    } catch (error) {
      console.error('❌ Failed to get all pN metadata:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async updateMetadataIndex(pnId, cid) {
    try {
      // Get existing index or create new one
      let index = {};
              try {
          const indexCid = process.env.METADATA_INDEX_CID;
          if (indexCid) {
            const response = await fetch(`https://gateway.pinata.cloud/ipfs/${indexCid}`);
            const indexBuffer = await response.buffer();
            index = JSON.parse(indexBuffer.toString());
          }
        } catch (error) {
          // Index doesn't exist yet, start with empty object
          console.log('Creating new metadata index');
        }

      // Update the index
      index[pnId] = cid;

      // Store the updated index
      const indexJson = JSON.stringify(index, null, 2);
      const indexBuffer = Buffer.from(indexJson, 'utf8');
      
      const formData = new FormData();
      formData.append('file', new Blob([indexBuffer]), 'index.json');
      
      const response = await fetch(`${this.ipfsUrl}/pinning/pinFileToIPFS`, {
        method: 'POST',
        headers: {
          'pinata_api_key': this.pinataApiKey,
          'pinata_secret_api_key': this.pinataSecretKey
        },
        body: formData
      });
      
      const result = await response.json();

      // Store the new index CID in environment (you'll need to update this manually)
      console.log(`New metadata index CID: ${result.IpfsHash}`);
      console.log('Please update METADATA_INDEX_CID environment variable');

      return result.IpfsHash;
    } catch (error) {
      console.error('❌ Failed to update metadata index:', error);
      throw error;
    }
  }

  async getMetadataIndex() {
    try {
      const indexCid = process.env.METADATA_INDEX_CID;
      if (!indexCid) {
        return {};
      }

      const response = await fetch(`https://gateway.pinata.cloud/ipfs/${indexCid}`);
      const indexBuffer = await response.buffer();
      return JSON.parse(indexBuffer.toString());
    } catch (error) {
      console.error('❌ Failed to get metadata index:', error);
      return {};
    }
  }
}

// Firebase Functions
const metadataService = new MetadataService();

/**
 * Update pN metadata
 */
exports.updatePNMetadata = functions.https.onCall(async (data, context) => {
  try {
    const { pnId, metadata } = data;
    
    if (!pnId || !metadata) {
      throw new functions.https.HttpsError('invalid-argument', 'pnId and metadata are required');
    }

    const result = await metadataService.updatePNMetadata(pnId, metadata);
    
    if (!result.success) {
      throw new functions.https.HttpsError('internal', result.error);
    }

    return result;
  } catch (error) {
    console.error('Error updating pN metadata:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get pN metadata
 */
exports.getPNMetadata = functions.https.onCall(async (data, context) => {
  try {
    const { pnId } = data;
    
    if (!pnId) {
      throw new functions.https.HttpsError('invalid-argument', 'pnId is required');
    }

    const result = await metadataService.getPNMetadata(pnId);
    
    if (!result.success) {
      throw new functions.https.HttpsError('not-found', result.error);
    }

    return result;
  } catch (error) {
    console.error('Error getting pN metadata:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get all pN metadata
 */
exports.getAllPNMetadata = functions.https.onCall(async (data, context) => {
  try {
    const result = await metadataService.getAllPNMetadata();
    
    if (!result.success) {
      throw new functions.https.HttpsError('internal', result.error);
    }

    return result;
  } catch (error) {
    console.error('Error getting all pN metadata:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
