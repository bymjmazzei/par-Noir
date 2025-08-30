// Integration Testing Utility
// This provides client-side testing for integrations without requiring a backend

export interface TestResult {
  success: boolean;
  message: string;
  details?: any;
}

export interface IntegrationTestConfig {
  integration: string;
  config: { [key: string]: string };
}

export class IntegrationTester {
  /**
   * Test IPFS integration
   */
  static async testIPFS(config: { [key: string]: string }): Promise<TestResult> {
    try {
      const { IPFS_PROJECT_ID, IPFS_PROJECT_SECRET, IPFS_URL } = config;
      
      if (!IPFS_PROJECT_ID || !IPFS_PROJECT_SECRET) {
        return {
          success: false,
          message: 'Missing required IPFS credentials'
        };
      }

      // Test IPFS connection by attempting to upload a small test file
      const testData = new Blob(['IPFS Test File'], { type: 'text/plain' });
      const formData = new FormData();
      formData.append('file', testData, 'test.txt');

      const response = await fetch(`${IPFS_URL}/api/v0/add`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${IPFS_PROJECT_ID}:${IPFS_PROJECT_SECRET}`)}`
        },
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        return {
          success: true,
          message: 'IPFS connection successful',
          details: { hash: result.Hash }
        };
      } else {
        return {
          success: false,
          message: `IPFS connection failed: ${response.status} ${response.statusText}`
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `IPFS test error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Test SendGrid email integration
   */
  static async testSendGrid(config: { [key: string]: string }): Promise<TestResult> {
    try {
      const { SENDGRID_API_KEY, FROM_EMAIL } = config;
      
      if (!SENDGRID_API_KEY || !FROM_EMAIL) {
        return {
          success: false,
          message: 'Missing required SendGrid credentials'
        };
      }

      // Test SendGrid API by checking account information
      const response = await fetch('https://api.sendgrid.com/v3/user/profile', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${SENDGRID_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const profile = await response.json();
        return {
          success: true,
          message: `SendGrid connected successfully (Account: ${profile.email})`,
          details: { email: profile.email }
        };
      } else {
        return {
          success: false,
          message: `SendGrid authentication failed: ${response.status} ${response.statusText}`
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `SendGrid test error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Test Twilio SMS integration
   */
  static async testTwilio(config: { [key: string]: string }): Promise<TestResult> {
    try {
      const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER } = config;
      
      if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
        return {
          success: false,
          message: 'Missing required Twilio credentials'
        };
      }

      // Test Twilio API by checking account information
      const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}.json`, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const account = await response.json();
        return {
          success: true,
          message: `Twilio connected successfully (Account: ${account.friendly_name})`,
          details: { accountName: account.friendly_name, status: account.status }
        };
      } else {
        return {
          success: false,
          message: `Twilio authentication failed: ${response.status} ${response.statusText}`
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Twilio test error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Test Coinbase Commerce integration
   */
  static async testCoinbase(config: { [key: string]: string }): Promise<TestResult> {
    try {
      const { COINBASE_COMMERCE_API_KEY } = config;
      
      if (!COINBASE_COMMERCE_API_KEY) {
        return {
          success: false,
          message: 'Missing required Coinbase Commerce API key'
        };
      }

      // Test Coinbase Commerce API by checking account information
      const response = await fetch('https://api.commerce.coinbase.com/charges', {
        method: 'GET',
        headers: {
          'X-CC-Api-Key': COINBASE_COMMERCE_API_KEY,
          'X-CC-Version': '2018-03-22',
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        return {
          success: true,
          message: 'Coinbase Commerce API connected successfully'
        };
      } else {
        return {
          success: false,
          message: `Coinbase Commerce authentication failed: ${response.status} ${response.statusText}`
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Coinbase Commerce test error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Test any integration based on type
   */
  static async testIntegration(testConfig: IntegrationTestConfig): Promise<TestResult> {
    const { integration, config } = testConfig;

    switch (integration) {
      case 'ipfs':
        return await this.testIPFS(config);
      case 'sendgrid':
        return await this.testSendGrid(config);
      case 'twilio':
        return await this.testTwilio(config);
      case 'coinbase':
        return await this.testCoinbase(config);
      default:
        return {
          success: false,
          message: `Unknown integration type: ${integration}`
        };
    }
  }

  /**
   * Validate API key format (basic validation)
   */
  static validateApiKey(integration: string, key: string, value: string): { valid: boolean; message: string } {
    switch (integration) {
      case 'ipfs':
        if (key === 'IPFS_PROJECT_ID' && value.length < 10) {
          return { valid: false, message: 'IPFS Project ID should be at least 10 characters' };
        }
        if (key === 'IPFS_PROJECT_SECRET' && value.length < 10) {
          return { valid: false, message: 'IPFS Project Secret should be at least 10 characters' };
        }
        break;
      
      case 'sendgrid':
        if (key === 'SENDGRID_API_KEY' && !value.startsWith('SG.')) {
          return { valid: false, message: 'SendGrid API key should start with "SG."' };
        }
        if (key === 'FROM_EMAIL' && !value.includes('@')) {
          return { valid: false, message: 'From Email should be a valid email address' };
        }
        break;
      
      case 'twilio':
        if (key === 'TWILIO_ACCOUNT_SID' && !value.startsWith('AC')) {
          return { valid: false, message: 'Twilio Account SID should start with "AC"' };
        }
        if (key === 'TWILIO_FROM_NUMBER' && !value.startsWith('+')) {
          return { valid: false, message: 'Twilio From Number should start with "+"' };
        }
        break;
      
      case 'coinbase':
        if (key === 'COINBASE_COMMERCE_API_KEY' && value.length < 20) {
          return { valid: false, message: 'Coinbase Commerce API key should be at least 20 characters' };
        }
        break;
    }

    return { valid: true, message: 'Valid' };
  }

  /**
   * Get integration status summary
   */
  static getIntegrationStatus(integrations: { [key: string]: any }): {
    configured: string[];
    missing: string[];
    errors: string[];
  } {
    const status = {
      configured: [] as string[],
      missing: [] as string[],
      errors: [] as string[]
    };

    Object.entries(integrations).forEach(([key, integration]) => {
      const hasRequiredKeys = Object.values(integration.apiKeys)
        .filter((apiKey: any) => apiKey.required)
        .every((apiKey: any) => apiKey.value.trim() !== '');

      if (hasRequiredKeys) {
        status.configured.push(key);
      } else {
        status.missing.push(key);
      }
    });

    return status;
  }
}
