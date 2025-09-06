import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider } from './contexts/ThemeContext';

// Custom render function with providers
export const renderWithProviders = (ui: React.ReactElement, options = {}) => {
  const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
    return React.createElement(ThemeProvider, null, children);
  };

  return render(ui, { wrapper: AllTheProviders, ...options });
};

// Mock crypto worker manager
export const mockCryptoWorkerManager = {
  isHealthy: jest.fn(() => true),
  encrypt: jest.fn(),
  decrypt: jest.fn(),
  generateKey: jest.fn(),
  sign: jest.fn(),
  verify: jest.fn()
};

// Mock identity verification
export const mockIdentityVerification = {
  verifyIdentity: jest.fn(() => Promise.resolve(true)),
  verifyLicense: jest.fn(() => Promise.resolve(true))
};

// Mock IPFS service
export const mockIPFSService = {
  upload: jest.fn(),
  download: jest.fn(),
  remove: jest.fn()
};

// Test data factories
export const createMockIdentity = (overrides = {}) => ({
  id: 'test-id-123',
  pnName: 'testuser',
  displayName: 'Test User',
  email: 'test@example.com',
  status: 'active',
  createdAt: new Date().toISOString(),
  isEncrypted: true,
  ...overrides
});

export const createMockLicense = (overrides = {}) => ({
  key: 'test-license-key',
  type: 'perpetual',
  status: 'active',
  issuedAt: new Date().toISOString(),
  expiresAt: null,
  ...overrides
});

// Async test helpers
export const waitForElementToBeRemoved = async (element: HTMLElement) => {
  await waitFor(() => {
    expect(element).not.toBeInTheDocument();
  });
};

export const waitForLoadingToFinish = async () => {
  await waitFor(() => {
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });
};