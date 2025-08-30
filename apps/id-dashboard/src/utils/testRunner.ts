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
    
    const results = await integrationTests.runAllTests();
    
    // Store results globally for inspection
    window.testResults = results;
    
    // Print formatted results
    integrationTests.printResults();
    
    
  } catch (error) {
  }
};

// Export for module usage
export const runTests = window.runIntegrationTests;
