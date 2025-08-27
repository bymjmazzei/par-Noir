// Test Runner for Browser Console
import { integrationTests } from './integrationTests';

// Make it available globally for browser console access
declare global {
  interface Window {
    runIntegrationTests: () => Promise<void>;
    testResults: any;
  }
}

// Global function to run tests from browser console
window.runIntegrationTests = async () => {
  try {
    console.log('🚀 Starting Integration Tests...');
    console.log('This will test all your service integrations.');
    console.log('Check the console for detailed results.\n');
    
    const results = await integrationTests.runAllTests();
    
    // Store results globally for inspection
    window.testResults = results;
    
    // Print formatted results
    integrationTests.printResults();
    
    console.log('\n💡 You can inspect detailed results with: window.testResults');
    
  } catch (error) {
    console.error('❌ Test runner failed:', error);
  }
};

// Export for module usage
export const runTests = window.runIntegrationTests;
