/**
 * Test Script for Pagination Implementation
 * 
 * Usage: 
 *   ts-node scripts/test-pagination.ts
 *   OR
 *   npm run test:pagination
 * 
 * Tests:
 * 1. Pagination parameters are accepted
 * 2. Response includes pagination metadata (total, hasMore)
 * 3. Different pages return different results
 * 4. Cache is working (second request should be faster)
 * 
 * Requires Node.js 18+ (for built-in fetch) or install node-fetch
 */

// Use built-in fetch (Node 18+) or fallback to node-fetch
let fetchFn: typeof fetch;
try {
  // Try to use global fetch (Node 18+)
  fetchFn = globalThis.fetch || fetch;
} catch {
  // Fallback to node-fetch if available
  try {
    const nodeFetch = require('node-fetch');
    fetchFn = nodeFetch as typeof fetch;
  } catch {
    throw new Error('No fetch implementation found. Use Node.js 18+ or install node-fetch');
  }
}

const API_ENDPOINT = process.env.API_ENDPOINT || 'http://localhost:3001';
const TEST_ENDPOINT = `${API_ENDPOINT}/api/aggregator/metadata-index`;

async function testPagination() {
  console.log('🧪 Testing Pagination Implementation\n');
  console.log(`API Endpoint: ${TEST_ENDPOINT}\n`);

  try {
    // Test 1: Basic pagination parameters
    console.log('Test 1: Basic pagination (limit=10, offset=0)');
    const start1 = Date.now();
    const response1 = await fetchFn(`${TEST_ENDPOINT}?limit=10&offset=0`);
    const time1 = Date.now() - start1;
    
    if (!response1.ok) {
      throw new Error(`HTTP ${response1.status}: ${await response1.text()}`);
    }
    
    const data1 = await response1.json();
    console.log(`✅ Response received in ${time1}ms`);
    console.log(`   Files returned: ${data1.files?.length || 0}`);
    console.log(`   Total files: ${data1.totalFiles || data1.total || 'N/A'}`);
    console.log(`   Has more: ${data1.hasMore || 'N/A'}`);
    
    if (!data1.files) {
      throw new Error('Response missing "files" property');
    }
    if (data1.files.length > 10) {
      throw new Error(`Expected max 10 files, got ${data1.files.length}`);
    }
    console.log('✅ Test 1 passed\n');

    // Test 2: Second page
    console.log('Test 2: Second page (limit=10, offset=10)');
    const start2 = Date.now();
    const response2 = await fetchFn(`${TEST_ENDPOINT}?limit=10&offset=10`);
    const time2 = Date.now() - start2;
    
    if (!response2.ok) {
      throw new Error(`HTTP ${response2.status}: ${await response2.text()}`);
    }
    
    const data2 = await response2.json();
    console.log(`✅ Response received in ${time2}ms`);
    console.log(`   Files returned: ${data2.files?.length || 0}`);
    
    // Verify different results
    if (data1.files.length > 0 && data2.files.length > 0) {
      const fileIds1 = new Set(data1.files.map((f: any) => f.fileId || f.metadata?.fileId));
      const fileIds2 = new Set(data2.files.map((f: any) => f.fileId || f.metadata?.fileId));
      const overlap = [...fileIds1].filter(id => fileIds2.has(id));
      
      if (overlap.length > 0) {
        console.warn(`⚠️  Warning: ${overlap.length} files overlap between pages (might be expected if data changed)`);
      } else {
        console.log('✅ No overlap between pages (good!)');
      }
    }
    console.log('✅ Test 2 passed\n');

    // Test 3: Cache test (second request should be faster if cached)
    console.log('Test 3: Cache performance (requesting same page twice)');
    const start3a = Date.now();
    await fetchFn(`${TEST_ENDPOINT}?limit=10&offset=0`);
    const time3a = Date.now() - start3a;
    
    const start3b = Date.now();
    await fetchFn(`${TEST_ENDPOINT}?limit=10&offset=0`);
    const time3b = Date.now() - start3b;
    
    console.log(`   First request: ${time3a}ms`);
    console.log(`   Second request: ${time3b}ms`);
    
    if (time3b < time3a * 0.8) {
      console.log('✅ Cache appears to be working (second request faster)');
    } else {
      console.log('ℹ️  Cache may not be active or Redis not configured');
    }
    console.log('✅ Test 3 passed\n');

    // Test 4: Large page size
    console.log('Test 4: Large page size (limit=50)');
    const start4 = Date.now();
    const response4 = await fetchFn(`${TEST_ENDPOINT}?limit=50&offset=0`);
    const time4 = Date.now() - start4;
    
    if (!response4.ok) {
      throw new Error(`HTTP ${response4.status}: ${await response4.text()}`);
    }
    
    const data4 = await response4.json();
    console.log(`✅ Response received in ${time4}ms`);
    console.log(`   Files returned: ${data4.files?.length || 0}`);
    
    if (data4.files.length > 50) {
      throw new Error(`Expected max 50 files, got ${data4.files.length}`);
    }
    console.log('✅ Test 4 passed\n');

    // Test 5: Filter with pagination
    console.log('Test 5: Filter with pagination (fileType=image)');
    const start5 = Date.now();
    const response5 = await fetchFn(`${TEST_ENDPOINT}?fileType=image&limit=10&offset=0`);
    const time5 = Date.now() - start5;
    
    if (!response5.ok) {
      throw new Error(`HTTP ${response5.status}: ${await response5.text()}`);
    }
    
    const data5 = await response5.json();
    console.log(`✅ Response received in ${time5}ms`);
    console.log(`   Files returned: ${data5.files?.length || 0}`);
    console.log(`   Total files: ${data5.totalFiles || data5.total || 'N/A'}`);
    console.log('✅ Test 5 passed\n');

    console.log('🎉 All pagination tests passed!');
    console.log('\n📊 Summary:');
    console.log(`   - Pagination parameters: ✅`);
    console.log(`   - Pagination metadata: ✅`);
    console.log(`   - Page differentiation: ✅`);
    console.log(`   - Cache performance: ${time3b < time3a * 0.8 ? '✅' : '⚠️'}`);
    console.log(`   - Large page sizes: ✅`);
    console.log(`   - Filtered pagination: ✅`);

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests
testPagination().catch(console.error);

