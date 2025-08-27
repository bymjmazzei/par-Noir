export interface SendGridConfig {
    apiKey: string;
    fromEmail: string;
    fromName: string;
    enabled: boolean;
    sandboxMode: boolean;
}
export interface EmailTemplate {
    id: string;
    name: string;
    subject: string;
    htmlContent: string;
    textContent: string;
}
export interface EmailRequest {
    to: string | string[];
    templateId?: string;
    subject?: string;
    htmlContent?: string;
    textContent?: string;
    dynamicTemplateData?: any;
    attachments?: EmailAttachment[];
    categories?: string[];
}
export interface EmailAttachment {
    content: string;
    filename: string;
    type: string;
    disposition?: 'attachment' | 'inline';
}
export interface EmailResponse {
    success: boolean;
    messageId?: string;
    error?: string;
    statusCode?: number;
}
export interface EmailStats {
    sent: number;
    delivered: number;
    bounced: number;
    opened: number;
    clicked: number;
    unsubscribed: number;
}
export declare class SendGridService {
    private config;
    private isInitialized;
    private templates;
    constructor(config: SendGridConfig);
    initialize(): Promise<void>;
    private simulateSendGridConnection;
    private initializeTemplates;
    sendEmail(request: EmailRequest): Promise<EmailResponse>;
    sendTemplateEmail(to: string | string[], templateId: string, dynamicTemplateData: any): Promise<EmailResponse>;
    sendRecoveryEmail(to: string, name: string, recoveryUrl: string, expiryTime: string): Promise<EmailResponse>;
    sendVerificationEmail(to: string, name: string, verificationUrl: string, expiryTime: string): Promise<EmailResponse>;
    sendSecurityAlert(to: string, name: string, activity: string, timestamp: string, location: string, device: string, securityUrl: string): Promise<EmailResponse>;
    getEmailStats(startDate: string, endDate: string): Promise<EmailStats>;
    private validateEmailRequest;
    private isValidEmail;
    private replaceTemplateVariables;
    private simulateEmailSending;
    private generateMessageId;
    getTemplate(templateId: string): EmailTemplate | undefined;
    listTemplates(): EmailTemplate[];
    addTemplate(template: EmailTemplate): void;
    removeTemplate(templateId: string): boolean;
    isReady(): boolean;
    getConfig(): SendGridConfig;
    updateConfig(newConfig: Partial<SendGridConfig>): Promise<void>;
}
export declare const emailService: SendGridService;
//# sourceMappingURL=emailService.d.ts.map