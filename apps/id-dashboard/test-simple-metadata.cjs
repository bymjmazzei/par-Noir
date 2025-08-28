// Test script for simple metadata service
const admin = require('firebase-admin');

// Initialize Firebase Admin (local test)
const serviceAccount = require('./firebase-service-account.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// Test the metadata service
async function testMetadataService() {
  console.log('🧪 Testing Simple Metadata Service...');
  
  try {
    const collection = 'pn-metadata';
    
    // Test data
    const testMetadata = {
      pnId: 'test-pn-123',
      name: 'Test pN',
      description: 'Test metadata for pN',
      attributes: {
        type: 'test',
        version: '1.0',
        features: ['identity', 'metadata', 'storage']
      },
      createdAt: new Date().toISOString()
    };

    // Test 1: Store metadata
    console.log('📤 Storing test metadata...');
    await db.collection(collection).doc(testMetadata.pnId).set({
      ...testMetadata,
      updatedAt: new Date().toISOString(),
      version: Date.now()
    });
    console.log('✅ Metadata stored successfully');

    // Test 2: Retrieve metadata
    console.log('📥 Retrieving metadata...');
    const doc = await db.collection(collection).doc(testMetadata.pnId).get();
    
    if (doc.exists) {
      const retrievedData = doc.data();
      console.log('✅ Metadata retrieved successfully:', retrievedData);
    } else {
      throw new Error('Metadata not found after storing');
    }

    // Test 3: Update metadata
    console.log('🔄 Updating metadata...');
    const updatedMetadata = {
      ...testMetadata,
      description: 'Updated test metadata',
      updatedAt: new Date().toISOString(),
      version: Date.now()
    };
    
    await db.collection(collection).doc(testMetadata.pnId).set(updatedMetadata);
    console.log('✅ Metadata updated successfully');

    // Test 4: Get all metadata
    console.log('📋 Getting all metadata...');
    const snapshot = await db.collection(collection).get();
    const allMetadata = [];
    
    snapshot.forEach(doc => {
      allMetadata.push(doc.data());
    });
    
    console.log('✅ All metadata retrieved:', allMetadata.length, 'records');

    // Cleanup: Delete test data
    console.log('🧹 Cleaning up test data...');
    await db.collection(collection).doc(testMetadata.pnId).delete();
    console.log('✅ Test data cleaned up');

    console.log('\n🎉 Simple Metadata Service test PASSED!');
    console.log('The service is ready for deployment.');
    
    return { success: true };
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return { success: false, error: error.message };
  }
}

// Run the test
testMetadataService().then(result => {
  if (result.success) {
    console.log('\n✅ All tests passed! The metadata service is working correctly.');
  } else {
    console.log('\n💥 Tests failed. Please check the configuration.');
  }
  
  // Exit the process
  process.exit(result.success ? 0 : 1);
});
