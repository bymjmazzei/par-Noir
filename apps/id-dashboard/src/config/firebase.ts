// Firebase configuration for production
// This will be replaced with real Firebase SDK when dependencies are resolved

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

// Placeholder Firebase configuration
// Replace these with your actual Firebase project credentials
export const firebaseConfig: FirebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "your-api-key-here",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "your-project.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "your-project-id",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "your-project.appspot.com",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "your-sender-id",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "your-app-id"
};

// Environment check
export const isProduction = process.env.NODE_ENV === 'production';
export const isDevelopment = process.env.NODE_ENV === 'development';

// Mock Firebase functions for now (will be replaced with real Firebase SDK)
export class MockFirebase {
  private static instance: MockFirebase;
  private isHealthy = true;

  static getInstance(): MockFirebase {
    if (!MockFirebase.instance) {
      MockFirebase.instance = new MockFirebase();
    }
    return MockFirebase.instance;
  }

  async healthCheck(): Promise<{ success: boolean; error?: string }> {
    // Simulate Firebase connection test
    await new Promise(resolve => setTimeout(resolve, 100));
    return { success: this.isHealthy };
  }

  async storeUpdate(_updateData: any): Promise<void> {
    // Simulate storing data in Firestore
    // Silently handle mock Firebase operations in production
    if (process.env.NODE_ENV === 'development') {
      // Development logging only
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  async getUpdates(_identityId: string): Promise<any[]> {
    // Simulate retrieving data from Firestore
    // Silently handle mock Firebase operations in production
    if (process.env.NODE_ENV === 'development') {
      // Development logging only
    }
    await new Promise(resolve => setTimeout(resolve, 150));
    return [];
  }
}

// Export mock instance for now
export const firebaseInstance = MockFirebase.getInstance();
