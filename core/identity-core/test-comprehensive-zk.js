/**
 * Comprehensive test script for Identity Management functionality
 * This demonstrates all the advanced features of the user-controlled identity system
 */

// Mock crypto for Node.js environment
if (!global.crypto) {
  global.crypto = require('crypto').webcrypto;
}

const { DistributedIdentityManager } = require('./dist/index.js');

async function testComprehensiveIdentityManagement() {
  console.log('🧪 Testing Comprehensive Identity Management...\n');

  try {
    // Test 1: Create DistributedIdentityManager instance with advanced configuration
    console.log('✅ Test 1: Creating advanced DistributedIdentityManager instance');
    const manager = new DistributedIdentityManager({
      enableIPFS: true,
      enableBlockchain: true,
      storageType: 'indexeddb',
      encryptionLevel: 'high',
      backupEnabled: true,
      syncEnabled: true,
      privacyLevel: 'maximum'
    });
    console.log('   Advanced DistributedIdentityManager instance created successfully');

    // Test 2: Initialize with advanced settings
    console.log('\n✅ Test 2: Initializing with advanced settings');
    await manager.initialize('comprehensive-test-password');
    console.log('   Manager initialized with advanced settings successfully');

    // Test 3: Create multiple user identities
    console.log('\n✅ Test 3: Creating multiple user identities');
    const identities = [];
    
    for (let i = 1; i <= 3; i++) {
      const identity = await manager.createIdentity({
        username: `user${i}`,
        displayName: `User ${i}`,
        email: `user${i}@example.com`,
        preferences: {
          privacy: 'high',
          sharing: 'selective',
          notifications: true,
          backup: true
        }
      });
      identities.push(identity);
      console.log(`   Created identity ${i}: ${identity.id}`);
    }

    // Test 4: Authenticate with different identities
    console.log('\n✅ Test 4: Authenticating with different identities');
    const sessions = [];
    
    for (const identity of identities) {
      const session = await manager.authenticate({
        username: identity.username,
        passcode: 'test-passcode'
      });
      sessions.push(session);
      console.log(`   Authenticated with ${identity.username}: ${session.id}`);
    }

    // Test 5: Update identity metadata with custom fields
    console.log('\n✅ Test 5: Updating identity metadata with custom fields');
    const updatedIdentity = await manager.updateMetadata({
      did: identities[0].id,
      passcode: 'test-passcode',
      metadata: {
        displayName: 'Enhanced User 1',
        customFields: {
          bio: 'Software developer and privacy advocate',
          location: 'San Francisco, CA',
          skills: ['JavaScript', 'TypeScript', 'React'],
          preferences: {
            theme: 'dark',
            language: 'en',
            timezone: 'America/Los_Angeles'
          }
        }
      }
    });
    console.log('   Identity metadata updated with custom fields successfully');
    console.log('   New display name:', updatedIdentity.metadata.displayName);

    // Test 6: Grant platform access with different permission levels
    console.log('\n✅ Test 6: Granting platform access with different permission levels');
    const platforms = [
      {
        id: 'social-platform',
        name: 'Social Media Platform',
        permissions: ['read:profile', 'write:posts', 'read:friends']
      },
      {
        id: 'ecommerce-platform',
        name: 'E-commerce Platform',
        permissions: ['read:profile', 'write:orders', 'read:preferences']
      },
      {
        id: 'banking-platform',
        name: 'Banking Platform',
        permissions: ['read:profile', 'write:transactions', 'read:balance']
      }
    ];

    for (const platform of platforms) {
      const access = await manager.grantToolAccess({
        did: identities[0].id,
        passcode: 'test-passcode',
        toolId: platform.id,
        permissions: platform.permissions,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
      });
      console.log(`   Granted access to ${platform.name} successfully`);
    }

    // Test 7: Process data sharing requests with different scenarios
    console.log('\n✅ Test 7: Processing data sharing requests with different scenarios');
    const dataRequests = [
      {
        platform: 'social-platform',
        requestedData: ['displayName', 'bio', 'location'],
        purpose: 'Social media profile creation'
      },
      {
        platform: 'ecommerce-platform',
        requestedData: ['displayName', 'email', 'preferences'],
        purpose: 'Account creation and personalized shopping'
      },
      {
        platform: 'banking-platform',
        requestedData: ['displayName', 'email', 'phone'],
        purpose: 'Account verification and compliance'
      }
    ];

    for (const request of dataRequests) {
      const response = await manager.processToolRequest(
        identities[0].id,
        'test-passcode',
        {
          toolId: request.platform,
          toolName: request.platform,
          toolDescription: request.purpose,
          requestedData: request.requestedData,
          permissions: ['read:profile'],
          requireZKProof: false
        }
      );
      console.log(`   Processed data request for ${request.platform}: ${response.granted ? 'Granted' : 'Denied'}`);
    }

    // Test 8: Test identity synchronization across devices
    console.log('\n✅ Test 8: Testing identity synchronization');
    const syncStatus = await manager.syncIdentities();
    console.log('   Identity synchronization completed');
    console.log('   Synced identities:', syncStatus.syncedCount);
    console.log('   Sync conflicts resolved:', syncStatus.conflictsResolved);

    // Test 9: Test backup and recovery
    console.log('\n✅ Test 9: Testing backup and recovery');
    const backup = await manager.createBackup();
    console.log('   Identity backup created successfully');
    console.log('   Backup size:', backup.size, 'bytes');
    console.log('   Backup timestamp:', backup.timestamp);

    // Test 10: Get comprehensive audit log
    console.log('\n✅ Test 10: Getting comprehensive audit log');
    const auditLog = manager.getAuditLog(identities[0].id);
    console.log('   Comprehensive audit log retrieved');
    console.log('   Total audit entries:', auditLog.length);
    
    // Group audit entries by type
    const auditByType = auditLog.reduce((acc, entry) => {
      acc[entry.action] = (acc[entry.action] || 0) + 1;
      return acc;
    }, {});
    
    console.log('   Audit entries by type:');
    Object.entries(auditByType).forEach(([type, count]) => {
      console.log(`     ${type}: ${count}`);
    });

    // Test 11: Get comprehensive statistics
    console.log('\n✅ Test 11: Getting comprehensive statistics');
    const stats = manager.getIdentityStats();
    console.log('   Comprehensive statistics retrieved:');
    console.log('   Total identities:', stats.totalIdentities);
    console.log('   Active sessions:', stats.activeSessions);
    console.log('   Data sharing events:', stats.dataSharingEvents);
    console.log('   Platform integrations:', stats.platformIntegrations);
    console.log('   Privacy score:', stats.privacyScore);

    // Test 12: Test privacy controls
    console.log('\n✅ Test 12: Testing privacy controls');
    const privacySettings = await manager.getPrivacySettings(identities[0].id);
    console.log('   Privacy settings retrieved:');
    console.log('   Privacy level:', privacySettings.level);
    console.log('   Data sharing preferences:', privacySettings.sharingPreferences);
    console.log('   Notification settings:', privacySettings.notifications);

    console.log('\n🎉 All comprehensive identity management tests completed successfully!');
    console.log('\n📝 Summary:');
    console.log('- Multiple user identity creation and management');
    console.log('- Advanced authentication and session management');
    console.log('- Multi-platform data sharing control');
    console.log('- Identity synchronization and backup');
    console.log('- Comprehensive audit logging');
    console.log('- Privacy controls and settings');

  } catch (error) {
    console.error('❌ Error during comprehensive testing:', error);
    process.exit(1);
  }
}

// Run the comprehensive test
testComprehensiveIdentityManagement();
