/**
 * Basic usage example for Identity Core
 */

import { IdentityCore } from '../src/index';

async function demonstrateIdentityCore() {
  console.log('🚀 Identity Core Demo Starting...\n');

  // Initialize Identity Core
  const identityCore = new IdentityCore({
    storageType: 'indexeddb',
    encryptionLevel: 'high',
    backupEnabled: true
  });

  try {
    await identityCore.initialize();
    console.log('✅ Identity Core initialized successfully');

    // Set up event listeners
    identityCore.on('did:created', (did) => {
      console.log('🎉 DID created:', did.id);
    });

    identityCore.on('authentication:success', (did) => {
      console.log('🔐 Authentication successful for:', did.username);
    });

    // Create a new DID
    console.log('\n📝 Creating new DID...');
    const did = await identityCore.createDID({
      username: 'alice',
      passcode: 'secure-passcode-123',
      displayName: 'Alice Johnson',
      email: 'alice@example.com',
      preferences: {
        privacy: 'high',
        sharing: 'selective',
        notifications: true,
        backup: true
      }
    });

    console.log('✅ DID created successfully');
    console.log('DID ID:', did.id);
    console.log('Username:', did.username);
    console.log('Display Name:', did.metadata.displayName);

    // Get all DIDs
    console.log('\n📋 Listing all DIDs...');
    const allDIDs = await identityCore.getAllDIDs();
    console.log('Found DIDs:', allDIDs.length);
    allDIDs.forEach(d => {
      console.log(`- ${d.username} (${d.id}) - ${d.status}`);
    });

    // Authenticate with the DID
    console.log('\n🔐 Authenticating...');
    const authenticatedDID = await identityCore.authenticate({
      username: did.username,
      passcode: 'secure-passcode-123'
    });
    console.log('✅ Authentication successful');

    // Update metadata
    console.log('\n✏️ Updating metadata...');
    const updatedDID = await identityCore.updateMetadata({
      did: did.id,
      passcode: 'secure-passcode-123',
      metadata: {
        displayName: 'Alice Smith',
        customFields: {
          bio: 'Software developer and privacy advocate',
          location: 'San Francisco, CA'
        }
      }
    });
    console.log('✅ Metadata updated');
    console.log('New display name:', updatedDID.metadata.displayName);

    // Grant tool access
    console.log('\n🔧 Granting tool access...');
    const toolAccessDID = await identityCore.grantToolAccess({
      did: did.id,
      passcode: 'secure-passcode-123',
      toolId: 'social-media-tool',
      permissions: ['read:profile', 'write:posts'],
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
    });
    console.log('✅ Tool access granted');

    // Process tool request
    console.log('\n🛠️ Processing tool request...');
    const toolResponse = await identityCore.processToolRequest(
      did.id,
      'secure-passcode-123',
      {
        toolId: 'social-media-tool',
        toolName: 'Social Media Tool',
        toolDescription: 'A tool for managing social media profiles and posts',
        requestedData: ['displayName', 'preferences'],
        permissions: ['read:profile'],
        requireZKProof: false
      }
    );
    console.log('✅ Tool request processed');
    console.log('Access granted:', toolResponse.granted);
    console.log('Data shared:', toolResponse.auditLog.dataShared);

    // Generate challenge for authentication
    console.log('\n🎯 Generating authentication challenge...');
    const challenge = await identityCore.generateChallenge(did.id);
    console.log('Challenge generated:', challenge.challenge.substring(0, 20) + '...');
    console.log('Expires at:', challenge.expiresAt);

    // Get audit log
    console.log('\n📊 Audit Log:');
    const auditLog = identityCore.getAuditLog(did.id);
    auditLog.forEach(entry => {
      console.log(`- ${entry.timestamp}: ${entry.toolId} - ${entry.action}`);
    });

    console.log('\n🎉 Demo completed successfully!');

  } catch (error) {
    console.error('❌ Error during demo:', error);
  } finally {
    // Cleanup
    identityCore.destroy();
  }
}

// Run the demo if this file is executed directly
if (typeof window !== 'undefined') {
  // Browser environment
  window.addEventListener('load', () => {
    demonstrateIdentityCore();
  });
} else {
  // Node.js environment
  demonstrateIdentityCore();
}

export { demonstrateIdentityCore }; 