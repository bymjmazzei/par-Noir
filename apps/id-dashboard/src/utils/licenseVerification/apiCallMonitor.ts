// API Call Monitor - Handles API call monitoring and frequency tracking
import { APICallRecord } from '../types/licenseVerification';

export class APICallMonitor {
  // Detection mechanism storage
  private static apiCallLog: APICallRecord[] = [];

  // API Call Frequency Monitoring
  static async monitorAPICallFrequency(identityHash: string): Promise<number> {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    
    // Filter API calls for this identity in the last hour
    const recentCalls = this.apiCallLog.filter(call => 
      call.identityHash === identityHash && call.timestamp > oneHourAgo
    );
    
    return recentCalls.length;
  }

  // Log API call for monitoring
  static logAPICall(identityHash: string, endpoint: string, method: string): void {
    const callRecord: APICallRecord = {
      timestamp: Date.now(),
      endpoint,
      method,
      identityHash
    };
    
    this.apiCallLog.push(callRecord);
    
    // Keep only last 10,000 API calls to prevent memory issues
    if (this.apiCallLog.length > 10000) {
      this.apiCallLog = this.apiCallLog.slice(-10000);
    }
  }

  // Clear API call logs (for testing or privacy)
  static clearAPICallLogs(): void {
    this.apiCallLog = [];
  }

  // Get API call statistics
  static getAPICallStats(): { totalAPICalls: number } {
    return {
      totalAPICalls: this.apiCallLog.length
    };
  }
}
