// Test script for metadata service
const fetch = require('node-fetch');

// Test IPFS HTTP API directly
async function testIPFS() {
  console.log('🧪 Testing IPFS MFS metadata service...');
  
  try {
    // Test data
    const testMetadata = {
      pnId: 'test-pn-123',
      name: 'Test pN',
      description: 'Test metadata',
      attributes: {
        type: 'test',
        version: '1.0'
      }
    };

    // Test adding to IPFS
    console.log('📤 Adding test metadata to IPFS...');
    const metadataJson = JSON.stringify(testMetadata, null, 2);
    const metadataBuffer = Buffer.from(metadataJson, 'utf8');
    
    // Using Pinata IPFS
    const ipfsUrl = 'https://api.pinata.cloud';
    const pinataApiKey = '950c8f37317d5ebaae77';
    const pinataSecretKey = process.env.PINATA_SECRET_KEY || 'your-pinata-secret-key';
    
    // Create form data
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', metadataBuffer, { filename: 'metadata.json' });
    
    const response = await fetch(`${ipfsUrl}/pinning/pinFileToIPFS`, {
      method: 'POST',
      headers: {
        'pinata_api_key': pinataApiKey,
        'pinata_secret_api_key': pinataSecretKey
      },
      body: form
    });
    
    if (!response.ok) {
      throw new Error(`IPFS add failed: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log('✅ Metadata added to IPFS:', result.IpfsHash);
    
    // Test retrieving from IPFS
    console.log('📥 Retrieving metadata from IPFS...');
    const getResponse = await fetch(`https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`);
    
    if (!getResponse.ok) {
      throw new Error(`IPFS cat failed: ${getResponse.status} ${getResponse.statusText}`);
    }
    
    const retrievedBuffer = await getResponse.buffer();
    const retrievedMetadata = JSON.parse(retrievedBuffer.toString());
    
    console.log('✅ Metadata retrieved successfully:', retrievedMetadata);
    console.log('🌐 IPFS Gateway URL:', `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`);
    
    return {
      success: true,
      cid: result.IpfsHash,
      metadata: retrievedMetadata,
      ipfsUrl: `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`
    };
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// Run the test
testIPFS().then(result => {
  if (result.success) {
    console.log('\n🎉 IPFS MFS metadata service test PASSED!');
    console.log('The service is ready for deployment.');
  } else {
    console.log('\n💥 IPFS MFS metadata service test FAILED!');
    console.log('Please check the IPFS configuration.');
  }
});
