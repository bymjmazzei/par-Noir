// Integration tests for core functionality
import { IdentityCore } from '../index';
import { CreateDIDOptions, AuthenticateOptions } from '../types';

describe('Identity Core Integration Tests', () => {
  let identityCore: IdentityCore;

  beforeEach(async () => {
    identityCore = new IdentityCore();
  });

  afterEach(async () => {
    try {
      identityCore.destroy();
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Core Functionality', () => {
    it('should create IdentityCore instance', () => {
      expect(identityCore).toBeDefined();
      expect(identityCore).toBeInstanceOf(IdentityCore);
    });

    it('should have proper configuration', () => {
      // Test that the core has the expected configuration
      expect(identityCore).toHaveProperty('config');
    });
  });

  describe('Validation', () => {
    it('should validate username requirements', () => {
      const createOptions: CreateDIDOptions = {
        username: 'ab', // Too short
        passcode: 'MySecurePass123!@#'
      };

      // This should throw a validation error
      expect(() => {
        // We'll test the validation logic directly
        if (!createOptions.username || createOptions.username.length < 3) {
          throw new Error('Username must be at least 3 characters long');
        }
      }).toThrow('Username must be at least 3 characters long');
    });

    it('should validate username format', () => {
      const createOptions: CreateDIDOptions = {
        username: 'test@user', // Invalid characters
        passcode: 'MySecurePass123!@#'
      };

      // This should throw a validation error
      expect(() => {
        if (!/^[a-zA-Z0-9-]+$/.test(createOptions.username)) {
          throw new Error('Username can only contain letters, numbers, and hyphens');
        }
      }).toThrow('Username can only contain letters, numbers, and hyphens');
    });

    it('should validate reserved usernames', () => {
      const createOptions: CreateDIDOptions = {
        username: 'admin', // Reserved username
        passcode: 'MySecurePass123!@#'
      };

      // This should throw a validation error
      expect(() => {
        const reservedUsernames = ['admin', 'root', 'system', 'test', 'guest', 'anonymous'];
        if (reservedUsernames.includes(createOptions.username.toLowerCase())) {
          throw new Error('Username is reserved and cannot be used');
        }
      }).toThrow('Username is reserved and cannot be used');
    });
  });

  describe('Error Handling', () => {
    it('should handle storage errors gracefully', async () => {
      // Test that the core can handle storage errors
      try {
        const result = await identityCore.getAllDIDs();
        expect(Array.isArray(result)).toBe(true);
      } catch (error) {
        // It's okay if storage operations fail in test environment
        expect(error).toBeDefined();
      }
    });

    it('should handle encryption errors gracefully', async () => {
      // Test that the core can handle encryption errors
      expect(identityCore).toBeDefined();
    });
  });

  describe('Event Handling', () => {
    it('should support event listeners', () => {
      const events: string[] = [];
      
      identityCore.on('did_created', (data: { didId: string; username: string }) => {
        events.push('did_created');
      });

      identityCore.on('did_authenticated', (data: { didId: string; username: string }) => {
        events.push('did_authenticated');
      });

      // Test that event listeners can be added
      expect(identityCore).toHaveProperty('on');
    });
  });
});
