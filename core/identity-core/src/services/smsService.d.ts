export interface TwilioConfig {
    accountSid: string;
    authToken: string;
    phoneNumber: string;
    enabled: boolean;
    sandboxMode: boolean;
}
export interface SMSRequest {
    to: string;
    message: string;
    from?: string;
    mediaUrl?: string[];
    statusCallback?: string;
}
export interface SMSResponse {
    success: boolean;
    messageId?: string;
    error?: string;
    statusCode?: number;
    status?: string;
}
export interface SMSStats {
    sent: number;
    delivered: number;
    failed: number;
    undelivered: number;
}
export interface PhoneNumberInfo {
    phoneNumber: string;
    countryCode: string;
    nationalFormat: string;
    internationalFormat: string;
    valid: boolean;
    carrier?: string;
    type?: 'mobile' | 'landline' | 'voip';
}
export declare class TwilioService {
    private config;
    private isInitialized;
    constructor(config: TwilioConfig);
    initialize(): Promise<void>;
    private simulateTwilioConnection;
    sendSMS(request: SMSRequest): Promise<SMSResponse>;
    sendRecoverySMS(to: string, recoveryCode: string, expiryTime: string): Promise<SMSResponse>;
    sendVerificationSMS(to: string, verificationCode: string, expiryTime: string): Promise<SMSResponse>;
    sendSecurityAlertSMS(to: string, activity: string, timestamp: string, location: string): Promise<SMSResponse>;
    send2FASMS(to: string, code: string, expiryTime: string): Promise<SMSResponse>;
    verifyPhoneNumber(phoneNumber: string): Promise<PhoneNumberInfo>;
    getSMSStats(startDate: string, endDate: string): Promise<SMSStats>;
    getMessageStatus(messageId: string): Promise<SMSResponse>;
    private validateSMSRequest;
    private isValidPhoneNumber;
    private simulateSMSSending;
    private generateMessageId;
    formatPhoneNumber(phoneNumber: string): string;
    isReady(): boolean;
    getConfig(): TwilioConfig;
    updateConfig(newConfig: Partial<TwilioConfig>): Promise<void>;
    getAvailablePhoneNumbers(countryCode?: string): Promise<string[]>;
    purchasePhoneNumber(phoneNumber: string): Promise<boolean>;
    releasePhoneNumber(phoneNumber: string): Promise<boolean>;
}
export declare const smsService: TwilioService;
//# sourceMappingURL=smsService.d.ts.map