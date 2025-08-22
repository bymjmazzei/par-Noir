/**
 * Test script for Identity Management functionality
 * This demonstrates the user-controlled identity features
 */

// Mock crypto for Node.js environment
if (!global.crypto) {
  global.crypto = require('crypto').webcrypto;
}

const { DistributedIdentityManager } = require('./dist/index.js');

async function testIdentityManagement() {
  console.log('🧪 Testing Identity Management...\n');

  try {
    // Test 1: Create DistributedIdentityManager instance
    console.log('✅ Test 1: Creating DistributedIdentityManager instance');
    const manager = new DistributedIdentityManager({
      enableIPFS: true,
      enableBlockchain: true,
      storageType: 'indexeddb',
      encryptionLevel: 'high'
    });
    console.log('   DistributedIdentityManager instance created successfully');

    // Test 2: Initialize the manager
    console.log('\n✅ Test 2: Initializing manager');
    await manager.initialize('test-sync-password');
    console.log('   Manager initialized successfully');

    // Test 3: Create user identity
    console.log('\n✅ Test 3: Creating user identity');
    const identity = await manager.createIdentity({
      username: 'testuser',
      displayName: 'Test User',
      email: 'test@example.com',
      preferences: {
        privacy: 'high',
        sharing: 'selective'
      }
    });
    console.log('   User identity created successfully');
    console.log('   Identity ID:', identity.id);

    // Test 4: Authenticate with identity
    console.log('\n✅ Test 4: Authenticating with identity');
    const session = await manager.authenticate({
      username: 'testuser',
      passcode: 'test-passcode'
    });
    console.log('   Authentication successful');
    console.log('   Session ID:', session.id);

    // Test 5: Update identity metadata
    console.log('\n✅ Test 5: Updating identity metadata');
    const updatedIdentity = await manager.updateMetadata({
      did: identity.id,
      passcode: 'test-passcode',
      metadata: {
        displayName: 'Updated Test User',
        customFields: {
          bio: 'Software developer',
          location: 'San Francisco'
        }
      }
    });
    console.log('   Identity metadata updated successfully');
    console.log('   New display name:', updatedIdentity.metadata.displayName);

    // Test 6: Grant platform access
    console.log('\n✅ Test 6: Granting platform access');
    const platformAccess = await manager.grantToolAccess({
      did: identity.id,
      passcode: 'test-passcode',
      toolId: 'test-platform',
      permissions: ['read:profile', 'write:data'],
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    });
    console.log('   Platform access granted successfully');

    // Test 7: Process data sharing request
    console.log('\n✅ Test 7: Processing data sharing request');
    const dataRequest = await manager.processToolRequest(
      identity.id,
      'test-passcode',
      {
        toolId: 'test-platform',
        toolName: 'Test Platform',
        toolDescription: 'A test platform for data sharing',
        requestedData: ['displayName', 'email'],
        permissions: ['read:profile'],
        requireZKProof: false
      }
    );
    console.log('   Data sharing request processed successfully');
    console.log('   Access granted:', dataRequest.granted);
    console.log('   Data shared:', dataRequest.auditLog.dataShared);

    // Test 8: Get audit log
    console.log('\n✅ Test 8: Getting audit log');
    const auditLog = manager.getAuditLog(identity.id);
    console.log('   Audit log retrieved successfully');
    console.log('   Total entries:', auditLog.length);
    auditLog.forEach(entry => {
      console.log(`   - ${entry.timestamp}: ${entry.toolId} - ${entry.action}`);
    });

    // Test 9: Get identity statistics
    console.log('\n✅ Test 9: Getting identity statistics');
    const stats = manager.getIdentityStats();
    console.log('   Identity statistics retrieved successfully');
    console.log('   Total identities:', stats.totalIdentities);
    console.log('   Active sessions:', stats.activeSessions);
    console.log('   Data sharing events:', stats.dataSharingEvents);

    console.log('\n🎉 All identity management tests completed successfully!');
    console.log('\n📝 Summary:');
    console.log('- User identity creation and management');
    console.log('- Authentication and session management');
    console.log('- Data sharing control with platforms');
    console.log('- Audit logging and privacy controls');

  } catch (error) {
    console.error('❌ Error during testing:', error);
    process.exit(1);
  }
}

// Run the test
testIdentityManagement();
