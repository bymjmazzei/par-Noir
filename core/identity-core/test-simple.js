/**
 * Simple test script for Identity Core
 * This tests the basic functionality without complex setup
 */

// Mock IndexedDB for Node.js environment
global.indexedDB = {
  open: () => ({
    result: {
      createObjectStore: () => {},
      transaction: () => ({
        objectStore: () => ({
          put: () => Promise.resolve(),
          get: () => Promise.resolve(),
          getAll: () => Promise.resolve([])
        })
      })
    },
    onupgradeneeded: null,
    onsuccess: null,
    onerror: null
  })
};

// Mock crypto for Node.js environment
if (!global.crypto) {
  global.crypto = require('crypto').webcrypto;
}

const { IdentityCore } = require('./dist/index.js');

async function testIdentityCore() {
  console.log('🧪 Testing Identity Core...\n');

  try {
    // Test 1: Create IdentityCore instance
    console.log('✅ Test 1: Creating IdentityCore instance');
    const identityCore = new IdentityCore({
      storageType: 'indexeddb',
      encryptionLevel: 'high',
      backupEnabled: true
    });
    console.log('   IdentityCore instance created successfully');

    // Test 2: Initialize
    console.log('\n✅ Test 2: Initializing IdentityCore');
    await identityCore.initialize();
    console.log('   IdentityCore initialized successfully');

    // Test 3: Create DID
    console.log('\n✅ Test 3: Creating DID');
    const did = await identityCore.createDID({
      username: 'testuser',
      passcode: 'secure-passcode-123',
      displayName: 'Test User',
      email: 'test@example.com'
    });
    console.log('   DID created successfully:', did.id);

    // Test 4: Get all DIDs
    console.log('\n✅ Test 4: Getting all DIDs');
    const allDIDs = await identityCore.getAllDIDs();
    console.log('   Found DIDs:', allDIDs.length);
    console.log('   DIDs:', allDIDs.map(d => ({ username: d.username, id: d.id, status: d.status })));

    // Test 5: Authenticate
    console.log('\n✅ Test 5: Authenticating');
    const authenticatedDID = await identityCore.authenticate({
      username: 'testuser',
      passcode: 'secure-passcode-123'
    });
    console.log('   Authentication successful for:', authenticatedDID.username);

    // Test 6: Update metadata
    console.log('\n✅ Test 6: Updating metadata');
    const updatedDID = await identityCore.updateMetadata({
      did: did.id,
      passcode: 'secure-passcode-123',
      metadata: {
        displayName: 'Updated Test User',
        customFields: {
          bio: 'Test user for identity core'
        }
      }
    });
    console.log('   Metadata updated successfully');
    console.log('   New display name:', updatedDID.metadata.displayName);

    // Test 7: Grant tool access
    console.log('\n✅ Test 7: Granting tool access');
    const toolAccessDID = await identityCore.grantToolAccess({
      did: did.id,
      passcode: 'secure-passcode-123',
      toolId: 'test-tool',
      permissions: ['read:profile', 'write:data'],
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    });
    console.log('   Tool access granted successfully');

    // Test 8: Process tool request
    console.log('\n✅ Test 8: Processing tool request');
    const toolResponse = await identityCore.processToolRequest(
      did.id,
      'secure-passcode-123',
      {
        toolId: 'test-tool',
        toolName: 'Test Tool',
        toolDescription: 'A test tool for verification',
        requestedData: ['displayName', 'email'],
        permissions: ['read:profile'],
        requireZKProof: false
      }
    );
    console.log('   Tool request processed successfully');
    console.log('   Access granted:', toolResponse.granted);

    // Test 9: Get audit log
    console.log('\n✅ Test 9: Getting audit log');
    const auditLog = identityCore.getAuditLog(did.id);
    console.log('   Audit log entries:', auditLog.length);
    auditLog.forEach((entry, index) => {
      console.log(`   Entry ${index + 1}: ${entry.timestamp} - ${entry.action}`);
    });

    console.log('\n🎉 All tests passed successfully!');
    console.log('\n📊 Summary:');
    console.log('   - IdentityCore instance created and initialized');
    console.log('   - DID created and authenticated');
    console.log('   - Metadata updated');
    console.log('   - Tool access granted');
    console.log('   - Tool request processed');
    console.log('   - Audit log retrieved');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error('Error details:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  } finally {
    // Cleanup
    if (typeof identityCore !== 'undefined') {
      identityCore.destroy();
    }
  }
}

// Run the test
testIdentityCore().catch(console.error);
