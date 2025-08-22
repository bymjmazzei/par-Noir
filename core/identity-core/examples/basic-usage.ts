/**
 * Basic usage example for Identity Core
 * 
 * This demonstrates how users create their own identities that serve as access tokens,
 * and how they control what data they share with third parties.
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
      console.log('🎉 Identity created:', did.id);
    });

    identityCore.on('authentication:success', (did) => {
      console.log('🔐 Authentication successful for:', did.username);
    });

    // Create a new user identity
    console.log('\n📝 Creating new user identity...');
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

    console.log('✅ User identity created successfully');
    console.log('Identity ID:', did.id);
    console.log('Username:', did.username);
    console.log('Display Name:', did.metadata.displayName);

    // Get all user identities
    console.log('\n📋 Listing all user identities...');
    const allDIDs = await identityCore.getAllDIDs();
    console.log('Found identities:', allDIDs.length);
    allDIDs.forEach(d => {
      console.log(`- ${d.username} (${d.id}) - ${d.status}`);
    });

    // Authenticate with the identity
    console.log('\n🔐 Authenticating...');
    const authenticatedDID = await identityCore.authenticate({
      username: did.username,
      passcode: 'secure-passcode-123'
    });
    console.log('✅ Authentication successful');

    // Update identity metadata
    console.log('\n✏️ Updating identity metadata...');
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
    console.log('✅ Identity metadata updated');
    console.log('New display name:', updatedDID.metadata.displayName);

    // Grant platform access to this identity
    console.log('\n🔧 Granting platform access...');
    const toolAccessDID = await identityCore.grantToolAccess({
      did: did.id,
      passcode: 'secure-passcode-123',
      toolId: 'social-media-platform',
      permissions: ['read:profile', 'write:posts'],
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
    });
    console.log('✅ Platform access granted');

    // Process platform request for data sharing
    console.log('\n🛠️ Processing platform data request...');
    const toolResponse = await identityCore.processToolRequest(
      did.id,
      'secure-passcode-123',
      {
        toolId: 'social-media-platform',
        toolName: 'Social Media Platform',
        toolDescription: 'A platform for managing social media profiles and posts',
        requestedData: ['displayName', 'preferences'],
        permissions: ['read:profile'],
        requireZKProof: false
      }
    );
    console.log('✅ Platform request processed');
    console.log('Access granted:', toolResponse.granted);
    console.log('Data shared:', toolResponse.auditLog.dataShared);

    // Generate authentication challenge
    console.log('\n🎯 Generating authentication challenge...');
    const challenge = await identityCore.generateChallenge(did.id);
    console.log('Challenge generated:', challenge.challenge.substring(0, 20) + '...');
    console.log('Expires at:', challenge.expiresAt);

    // Get audit log of data sharing
    console.log('\n📊 Data Sharing Audit Log:');
    const auditLog = identityCore.getAuditLog(did.id);
    auditLog.forEach(entry => {
      console.log(`- ${entry.timestamp}: ${entry.toolId} - ${entry.action}`);
    });

    console.log('\n🎉 Demo completed successfully!');
    console.log('\n📝 Summary:');
    console.log('- User created their own identity');
    console.log('- Identity serves as an access token for platforms');
    console.log('- User controls what data is shared with each platform');
    console.log('- No verification or attestation of personal data');

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