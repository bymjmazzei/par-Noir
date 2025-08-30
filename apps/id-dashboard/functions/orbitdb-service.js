const functions = require('firebase-functions');
const OrbitDB = require('orbit-db');
const IPFS = require('ipfs-http-client');

// OrbitDB service for pN metadata updates
class OrbitDBService {
  constructor() {
    this.ipfs = null;
    this.orbitdb = null;
    this.database = null;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;

    try {
      // Connect to IPFS (using Infura or Pinata)
      const ipfsUrl = process.env.IPFS_NODE_URL || 'https://ipfs.infura.io:5001';
      this.ipfs = IPFS.create({ url: ipfsUrl });

      // Create OrbitDB instance
      this.orbitdb = await OrbitDB.createInstance(this.ipfs);

      // Create/open database for pN metadata
      this.database = await this.orbitdb.docs('par-noir-metadata', {
        indexBy: 'pnId',
        accessController: {
          type: 'ipfs',
          admin: ['*'],
          write: ['*']
        }
      });

      // Wait for database to load
      await this.database.load();

      this.isInitialized = true;
      console.log('✅ OrbitDB initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize OrbitDB:', error);
      throw error;
    }
  }

  async updatePNMetadata(pnId, metadata) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Add or update metadata
      const cid = await this.database.put({
        pnId,
        ...metadata,
        updatedAt: new Date().toISOString()
      });

      return {
        success: true,
        cid: cid.toString(),
        metadata: {
          pnId,
          ...metadata,
          updatedAt: new Date().toISOString()
        }
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
      // Query database for metadata
      const results = await this.database.query((doc) => doc.pnId === pnId);
      
      if (results.length === 0) {
        return {
          success: false,
          error: 'Metadata not found'
        };
      }

      return {
        success: true,
        metadata: results[0]
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
      // Get all metadata
      const results = await this.database.query(() => true);
      
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
}

// Firebase Functions
const orbitDBService = new OrbitDBService();

/**
 * Update pN metadata
 */
exports.updatePNMetadata = functions.https.onCall(async (data, context) => {
  try {
    const { pnId, metadata } = data;
    
    if (!pnId || !metadata) {
      throw new functions.https.HttpsError('invalid-argument', 'pnId and metadata are required');
    }

    const result = await orbitDBService.updatePNMetadata(pnId, metadata);
    
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

    const result = await orbitDBService.getPNMetadata(pnId);
    
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
    const result = await orbitDBService.getAllPNMetadata();
    
    if (!result.success) {
      throw new functions.https.HttpsError('internal', result.error);
    }

    return result;
  } catch (error) {
    console.error('Error getting all pN metadata:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
