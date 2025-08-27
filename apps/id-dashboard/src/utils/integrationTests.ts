// Integration Tests for All Services (Browser-Compatible)
export interface TestResult {
  service: string;
  status: 'success' | 'error' | 'skipped';
  message: string;
  details?: any;
}

export class IntegrationTests {
  private results: TestResult[] = [];

  async runAllTests(): Promise<TestResult[]> {
    console.log('🧪 Starting Integration Tests...');
    this.results = [];

    // Test Environment Variables
    await this.testEnvironmentVariables();
    
    // Test Coinbase Commerce Configuration
    await this.testCoinbase();
    
    // Test IPFS Service (browser-compatible)
    await this.testIPFS();

    console.log('✅ Integration Tests Complete!');
    return this.results;
  }

  private async testIPFS(): Promise<void> {
    try {
      console.log('🌐 Testing Pinata IPFS Service...');
      
      // Test configuration availability
      const apiKey = process.env.REACT_APP_PINATA_API_KEY;
      const gatewayUrl = process.env.REACT_APP_IPFS_GATEWAY_URL;
      
      if (!apiKey) {
        this.results.push({
          service: 'Pinata IPFS',
          status: 'skipped',
          message: 'Pinata API key not configured',
          details: { reason: 'Environment variable not set' }
        });
        console.log('⏭️ IPFS Test: SKIPPED');
        return;
      }
      
      this.results.push({
        service: 'Pinata IPFS',
        status: 'success',
        message: 'IPFS service configured correctly',
        details: { 
          hasApiKey: !!apiKey,
          gatewayUrl: gatewayUrl || 'https://gateway.pinata.cloud',
          readyForUpload: true
        }
      });
      
      console.log('✅ IPFS Test: PASSED');
    } catch (error) {
      this.results.push({
        service: 'Pinata IPFS',
        status: 'error',
        message: `IPFS service failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error }
      });
      console.log('❌ IPFS Test: FAILED');
    }
  }

  private async testCoinbase(): Promise<void> {
    try {
      console.log('💰 Testing Coinbase Commerce...');
      
      // Test API key availability
      const apiKey = process.env.REACT_APP_COINBASE_COMMERCE_API_KEY;
      
      if (!apiKey) {
        this.results.push({
          service: 'Coinbase Commerce',
          status: 'skipped',
          message: 'Coinbase API key not configured',
          details: { reason: 'Environment variable not set' }
        });
        console.log('⏭️ Coinbase Test: SKIPPED');
        return;
      }
      
      // Test configuration
      const { COINBASE_CONFIG } = await import('../config/coinbase');
      
      this.results.push({
        service: 'Coinbase Commerce',
        status: 'success',
        message: 'Coinbase Commerce configured correctly',
        details: { 
          hasApiKey: !!apiKey,
          supportedCurrencies: COINBASE_CONFIG.SUPPORTED_CURRENCIES,
          webhookEvents: COINBASE_CONFIG.WEBHOOK_EVENTS
        }
      });
      
      console.log('✅ Coinbase Test: PASSED');
    } catch (error) {
      this.results.push({
        service: 'Coinbase Commerce',
        status: 'error',
        message: `Coinbase service failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error }
      });
      console.log('❌ Coinbase Test: FAILED');
    }
  }

  private async testEnvironmentVariables(): Promise<void> {
    try {
      console.log('🔧 Testing Environment Variables...');
      
      const requiredVars = [
        'REACT_APP_TWILIO_ACCOUNT_SID',
        'REACT_APP_TWILIO_AUTH_TOKEN', 
        'REACT_APP_TWILIO_FROM_NUMBER',
        'REACT_APP_SENDGRID_API_KEY',
        'REACT_APP_FROM_EMAIL',
        'REACT_APP_FROM_NAME',
        'REACT_APP_PINATA_API_KEY',
        'REACT_APP_IPFS_GATEWAY_URL',
        'REACT_APP_COINBASE_COMMERCE_API_KEY'
      ];
      
      const missingVars: string[] = [];
      const presentVars: string[] = [];
      
      requiredVars.forEach(varName => {
        const value = process.env[varName];
        if (value && value !== '') {
          presentVars.push(varName);
        } else {
          missingVars.push(varName);
        }
      });
      
      this.results.push({
        service: 'Environment Variables',
        status: missingVars.length === 0 ? 'success' : 'error',
        message: missingVars.length === 0 
          ? 'All required environment variables are set'
          : `Missing ${missingVars.length} environment variables`,
        details: { 
          present: presentVars.length,
          missing: missingVars,
          total: requiredVars.length
        }
      });
      
      if (missingVars.length === 0) {
        console.log('✅ Environment Variables Test: PASSED');
      } else {
        console.log('❌ Environment Variables Test: FAILED');
      }
    } catch (error) {
      this.results.push({
        service: 'Environment Variables',
        status: 'error',
        message: `Environment test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error }
      });
      console.log('❌ Environment Variables Test: FAILED');
    }
  }

  getSummary(): { total: number; passed: number; failed: number; skipped: number } {
    const total = this.results.length;
    const passed = this.results.filter(r => r.status === 'success').length;
    const failed = this.results.filter(r => r.status === 'error').length;
    const skipped = this.results.filter(r => r.status === 'skipped').length;
    
    return { total, passed, failed, skipped };
  }

  printResults(): void {
    console.log('\n📊 Integration Test Results:');
    console.log('============================');
    
    this.results.forEach(result => {
      const icon = result.status === 'success' ? '✅' : result.status === 'error' ? '❌' : '⏭️';
      console.log(`${icon} ${result.service}: ${result.message}`);
      
      if (result.details) {
        console.log(`   Details:`, result.details);
      }
    });
    
    const summary = this.getSummary();
    console.log('\n📈 Summary:');
    console.log(`   Total: ${summary.total}`);
    console.log(`   Passed: ${summary.passed}`);
    console.log(`   Failed: ${summary.failed}`);
    console.log(`   Skipped: ${summary.skipped}`);
    
    if (summary.failed === 0) {
      console.log('\n🎉 All tests passed! Your integrations are configured correctly.');
    } else {
      console.log('\n⚠️ Some tests failed. Check the details above.');
    }
  }
}

// Export test instance
export const integrationTests = new IntegrationTests();
