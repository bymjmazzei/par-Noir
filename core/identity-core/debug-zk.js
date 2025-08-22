/**
 * Debug script for ZK Proof generation
 */

// Mock crypto for Node.js environment
if (!global.crypto) {
  global.crypto = require('crypto').webcrypto;
}

const { AuthenticZKProofManager } = require('./dist/encryption/zk-proofs.js');

async function debugZKProof() {
  console.log('🔍 Debugging ZK Proof Generation...\n');

  try {
    // Test 1: Create ZK Proof Manager
    console.log('✅ Test 1: Creating ZK Proof Manager');
    const zkManager = new AuthenticZKProofManager({
      curve: 'P-384',
      hashAlgorithm: 'SHA-512',
      securityLevel: 'military',
      quantumResistant: true,
      usePedersenCommitments: true,
      useSchnorrSignatures: true
    });
    console.log('   ZK Proof Manager created successfully');

    // Test 2: Test individual components
    console.log('\n✅ Test 2: Testing individual components');
    
    // Test hashData
    console.log('   Testing hashData...');
    const hash = await zkManager['hashData']('test data', false);
    console.log('   Hash result length:', hash.byteLength);

    // Test generateSecureRandom
    console.log('   Testing generateSecureRandom...');
    const random = zkManager['generateSecureRandom']();
    console.log('   Random value:', random.toString(16).substring(0, 20) + '...');

    // Test objectToBigInt
    console.log('   Testing objectToBigInt...');
    const bigInt = zkManager['objectToBigInt']({ test: 'data' });
    console.log('   BigInt value:', bigInt.toString(16).substring(0, 20) + '...');

    // Test generateKeyPair
    console.log('   Testing generateKeyPair...');
    const keyPair = await zkManager['generateKeyPair'](false);
    console.log('   Key pair generated:', !!keyPair.publicKey && !!keyPair.privateKey);

    // Test 3: Test Schnorr signature generation
    console.log('\n✅ Test 3: Testing Schnorr signature generation');
    const request = {
      type: 'identity_existence',
      statement: 'User has a valid identity',
      privateInputs: { secret: process.env.TEST_SECRET || 'test-secret-data' },
      publicInputs: { identityType: 'personal' }
    };
    
    const schnorrSignature = await zkManager['generateRealSchnorrSignature'](request, false);
    console.log('   Schnorr signature generated successfully');
    console.log('   R:', schnorrSignature.R.substring(0, 50) + '...');
    console.log('   s:', schnorrSignature.s.substring(0, 20) + '...');

    // Test 4: Test Pedersen commitment generation
    console.log('\n✅ Test 4: Testing Pedersen commitment generation');
    const pedersenCommitment = await zkManager['generateRealPedersenCommitment'](request.privateInputs, false);
    console.log('   Pedersen commitment generated successfully');
    console.log('   Commitment:', pedersenCommitment.commitment.substring(0, 50) + '...');

    // Test 5: Test sigma proof generation
    console.log('\n✅ Test 5: Testing sigma proof generation');
    const sigmaProof = await zkManager['generateRealSigmaProof'](request, false);
    console.log('   Sigma proof generated successfully');
    console.log('   Commitment:', sigmaProof.commitment.substring(0, 50) + '...');

    // Test 6: Test full proof generation
    console.log('\n✅ Test 6: Testing full proof generation');
    const proof = await zkManager.generateProof({
      type: 'identity_existence',
      statement: 'User has a valid identity',
      privateInputs: { secret: process.env.TEST_SECRET || 'test-secret-data' },
      publicInputs: { identityType: 'personal' },
      securityLevel: 'military',
      quantumResistant: false // Use non-quantum for debugging
    });
    
    console.log('   Full proof generated successfully!');
    console.log('   Proof ID:', proof.id);
    console.log('   Type:', proof.type);
    console.log('   Quantum resistant:', proof.quantumResistant);

    console.log('\n🎉 All debug tests passed!');

  } catch (error) {
    console.error('❌ Debug test failed:', error.message);
    console.error('Stack trace:', error.stack);
    
    // Try to identify the specific error
    if (error.message.includes('Failed to generate Schnorr signature')) {
      console.error('\n🔍 Error in Schnorr signature generation');
    } else if (error.message.includes('Failed to generate Pedersen commitment')) {
      console.error('\n🔍 Error in Pedersen commitment generation');
    } else if (error.message.includes('Failed to generate sigma proof')) {
      console.error('\n🔍 Error in sigma proof generation');
    } else {
      console.error('\n🔍 Unknown error in ZK proof generation');
    }
  }
}

// Run the debug
debugZKProof().catch(console.error);
