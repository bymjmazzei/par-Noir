/**
 * Build-time integration env (VITE_*).
 * Use IntegrationConfigManager.getApiKey() for runtime user-configured values first,
 * then fall back to these. Never use process.env.REACT_APP_* in id-dashboard.
 */
const env = import.meta.env;

export const integrationsEnv = {
  // IPFS / Pinata
  IPFS_PROJECT_ID: (env.VITE_IPFS_PROJECT_ID as string) ?? '',
  IPFS_PROJECT_SECRET: (env.VITE_IPFS_PROJECT_SECRET as string) ?? '',
  IPFS_URL: (env.VITE_IPFS_URL as string) ?? 'https://ipfs.infura.io:5001',
  IPFS_API_KEY: (env.VITE_IPFS_API_KEY as string) ?? '',
  IPFS_GATEWAY_URL: (env.VITE_IPFS_GATEWAY_URL as string) ?? 'https://gateway.pinata.cloud',
  PINATA_API_KEY: (env.VITE_PINATA_API_KEY as string) ?? '',
  PINATA_SECRET_KEY: (env.VITE_PINATA_SECRET_KEY as string) ?? '',
  PINATA_SECRET_API_KEY: (env.VITE_PINATA_SECRET_API_KEY as string) ?? '',
  // SendGrid
  SENDGRID_API_KEY: (env.VITE_SENDGRID_API_KEY as string) ?? '',
  FROM_EMAIL: (env.VITE_FROM_EMAIL as string) ?? '',
  FROM_NAME: (env.VITE_FROM_NAME as string) ?? '',
  // Twilio
  TWILIO_ACCOUNT_SID: (env.VITE_TWILIO_ACCOUNT_SID as string) ?? '',
  TWILIO_AUTH_TOKEN: (env.VITE_TWILIO_AUTH_TOKEN as string) ?? '',
  TWILIO_FROM_NUMBER: (env.VITE_TWILIO_FROM_NUMBER as string) ?? '',
  // Coinbase
  COINBASE_COMMERCE_API_KEY: (env.VITE_COINBASE_COMMERCE_API_KEY as string) ?? '',
  COINBASE_WEBHOOK_SECRET: (env.VITE_COINBASE_WEBHOOK_SECRET as string) ?? '',
  // API URL (decentralized auth)
  API_URL: (env.VITE_API_URL as string) ?? (env.VITE_API_ENDPOINT as string) ?? '',
  // Google Drive (optional)
  GOOGLE_CLIENT_ID: (env.VITE_GOOGLE_CLIENT_ID as string) ?? '',
};
