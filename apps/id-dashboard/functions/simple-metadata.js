const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Simple metadata service using Firestore (temporary solution)
class SimpleMetadataService {
  constructor() {
    this.collection = 'pn-metadata';
  }

  async updatePNMetadata(pnId, metadata) {
    try {
      // Create metadata object with timestamp
      const metadataObject = {
        pnId,
        ...metadata,
        updatedAt: new Date().toISOString(),
        version: Date.now()
      };

      // Store in Firestore
      await db.collection(this.collection).doc(pnId).set(metadataObject);

      return {
        success: true,
        metadata: metadataObject,
        id: pnId
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
    try {
      // Get from Firestore
      const doc = await db.collection(this.collection).doc(pnId).get();
      
      if (!doc.exists) {
        return {
          success: false,
          error: 'Metadata not found'
        };
      }

      return {
        success: true,
        metadata: doc.data()
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
    try {
      // Get all from Firestore
      const snapshot = await db.collection(this.collection).get();
      const results = [];
      
      snapshot.forEach(doc => {
        results.push(doc.data());
      });

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
const metadataService = new SimpleMetadataService();

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
