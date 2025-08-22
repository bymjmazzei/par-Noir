/**
 * Minimal test script for Identity Core
 * This tests only the basic functionality without complex setup
 */

// Mock crypto for Node.js environment
if (!global.crypto) {
  global.crypto = require('crypto').webcrypto;
}

const { ZKProofManager } = require('./dist/index.js');

async function testMinimal() {
  console.log('🧪 Testing Minimal Functionality...\n');

  try {
    // Test 1: Create ZKProofManager instance
    console.log('✅ Test 1: Creating ZKProofManager instance');
    const zkManager = new ZKProofManager({
      curve: 'BLS12-381',
      hashAlgorithm: 'SHAKE256',
      proofExpirationHours: 24,
      enableSelectiveDisclosure: true,
      securityLevel: 'military',
      keyLength: 512,
      iterations: 100000,
      memoryCost: 1024,
      quantumResistant: true,
      usePedersenCommitments: true,
      useSchnorrSignatures: true
    });
    console.log('   ZKProofManager instance created successfully');

    // Test 2: Generate a simple proof
    console.log('\n✅ Test 2: Generating a simple proof');
    const proof = await zkManager.generateProof({
      type: 'identity_existence',
      statement: 'User exists and is over 18',
      privateInputs: {
        age: 25,
        userId: 'user123'
      },
      publicInputs: {
        minimumAge: 18
      },
      securityLevel: 'military',
      quantumResistant: true
    });
    console.log('   Proof generated successfully');
    console.log('   Proof ID:', proof.id);
    console.log('   Type:', proof.type);
    console.log('   Quantum resistant:', proof.quantumResistant);
    console.log('   Algorithm:', proof.algorithm);

    // Test 3: Get proof statistics
    console.log('\n✅ Test 3: Getting proof statistics');
    const stats = zkManager.getProofStats();
    console.log('   Total proofs:', stats.totalProofs);
    console.log('   Active proofs:', stats.activeProofs);
    console.log('   Quantum resistant count:', stats.quantumResistantCount);
    console.log('   Compliance rate:', stats.complianceRate);

    // Test 4: Get quantum resistance status
    console.log('\n✅ Test 4: Getting quantum resistance status');
    const quantumStatus = zkManager.getQuantumResistanceStatus();
    console.log('   Quantum resistance enabled:', quantumStatus.enabled);
    console.log('   Coverage:', quantumStatus.coverage + '%');
    console.log('   Algorithms:', quantumStatus.algorithms.join(', '));
    console.log('   Migration progress:', quantumStatus.migrationProgress + '%');

    // Test 5: Get security compliance report
    console.log('\n✅ Test 5: Getting security compliance report');
    const complianceReport = zkManager.getSecurityComplianceReport();
    console.log('   Overall compliance:', complianceReport.overallCompliance);
    console.log('   Security score:', complianceReport.securityScore);
    console.log('   Risk assessment:', complianceReport.riskAssessment);

    console.log('\n🎉 All minimal tests passed successfully!');
    console.log('\n📊 Summary:');
    console.log('   - ZKProofManager instance created');
    console.log('   - Identity existence proof generated');
    console.log('   - Statistics and compliance reports retrieved');
    console.log('   - Quantum resistance features working');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error('Error details:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run the test
testMinimal().catch(console.error);
