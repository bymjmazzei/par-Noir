#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('=== PHASE 3.4: ADVANCED TESTING IMPLEMENTATION ===\n');

// Create testing configuration
const testingConfig = {
  jest: {
    preset: 'ts-jest',
    testEnvironment: 'jsdom',
    setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
    moduleNameMapping: {
      '^@/(.*)$': '<rootDir>/src/$1',
      '\\.(css|less|scss|sass)$': 'identity-obj-proxy'
    },
    collectCoverageFrom: [
      'src/**/*.{ts,tsx}',
      '!src/**/*.d.ts',
      '!src/index.tsx',
      '!src/serviceWorker.ts'
    ],
    coverageThreshold: {
      global: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80
      }
    }
  },
  cypress: {
    baseUrl: 'http://localhost:3000',
    viewportWidth: 1280,
    viewportHeight: 720,
    video: false,
    screenshotOnRunFailure: true
  }
};

// Create Jest configuration
const jestConfig = `module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy'
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/index.tsx',
    '!src/serviceWorker.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.{ts,tsx}',
    '<rootDir>/src/**/*.{test,spec}.{ts,tsx}'
  ],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest'
  }
};`;

// Create setupTests.ts
const setupTests = `import '@testing-library/jest-dom';
import 'jest-environment-jsdom';

// Mock crypto API for testing
Object.defineProperty(window, 'crypto', {
  value: {
    subtle: {
      generateKey: jest.fn(),
      encrypt: jest.fn(),
      decrypt: jest.fn(),
      sign: jest.fn(),
      verify: jest.fn(),
      deriveBits: jest.fn(),
      importKey: jest.fn(),
      exportKey: jest.fn()
    },
    getRandomValues: jest.fn()
  }
});

// Mock Web Workers
global.Worker = jest.fn().mockImplementation(() => ({
  postMessage: jest.fn(),
  terminate: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn()
}));

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn()
};
global.localStorage = localStorageMock;

// Mock IndexedDB
global.indexedDB = {
  open: jest.fn(),
  deleteDatabase: jest.fn()
};

// Mock fetch
global.fetch = jest.fn();

// Mock ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn()
}));

// Mock IntersectionObserver
global.IntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn()
}));

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock URL.createObjectURL
global.URL.createObjectURL = jest.fn(() => 'mocked-url');
global.URL.revokeObjectURL = jest.fn();

// Mock navigator.clipboard
Object.assign(navigator, {
  clipboard: {
    writeText: jest.fn(),
    readText: jest.fn()
  }
});

// Mock window.open
global.open = jest.fn();

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  warn: jest.fn(),
  error: jest.fn(),
  log: jest.fn()
};`;

// Create test utilities
const testUtils = `import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider } from '../contexts/ThemeContext';

// Custom render function with providers
export const renderWithProviders = (ui: React.ReactElement, options = {}) => {
  const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
    return (
      <ThemeProvider>
        {children}
      </ThemeProvider>
    );
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
};`;

// Create sample test files
const createSampleTests = () => {
  const testDir = './apps/id-dashboard/src/__tests__';
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  // Component test template
  const componentTestTemplate = `import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import { ComponentName } from '../components/ComponentName';

describe('ComponentName', () => {
  it('renders without crashing', () => {
    renderWithProviders(<ComponentName />);
    expect(screen.getByText(/ComponentName/i)).toBeInTheDocument();
  });

  it('handles user interactions correctly', () => {
    renderWithProviders(<ComponentName />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    // Add assertions here
  });

  it('displays correct information', () => {
    const mockData = { name: 'Test Data' };
    renderWithProviders(<ComponentName data={mockData} />);
    expect(screen.getByText('Test Data')).toBeInTheDocument();
  });
});`;

  // Hook test template
  const hookTestTemplate = `import { renderHook, act } from '@testing-library/react-hooks';
import { useCustomHook } from '../hooks/useCustomHook';

describe('useCustomHook', () => {
  it('returns initial state', () => {
    const { result } = renderHook(() => useCustomHook());
    expect(result.current.value).toBe(initialValue);
  });

  it('updates state correctly', () => {
    const { result } = renderHook(() => useCustomHook());
    
    act(() => {
      result.current.updateValue('new value');
    });
    
    expect(result.current.value).toBe('new value');
  });
});`;

  // Integration test template
  const integrationTestTemplate = `import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import { mockCryptoWorkerManager, mockIPFSService } from '../test-utils';

// Mock external dependencies
jest.mock('../utils/cryptoWorkerManager', () => mockCryptoWorkerManager);
jest.mock('../services/ipfsService', () => mockIPFSService);

describe('Integration Tests', () => {
  it('handles complete user workflow', async () => {
    renderWithProviders(<App />);
    
    // Test complete user journey
    await waitFor(() => {
      expect(screen.getByText(/welcome/i)).toBeInTheDocument();
    });
    
    // Add more workflow steps
  });
});`;

  // Write test files
  fs.writeFileSync(path.join(testDir, 'ComponentName.test.tsx'), componentTestTemplate);
  fs.writeFileSync(path.join(testDir, 'useCustomHook.test.ts'), hookTestTemplate);
  fs.writeFileSync(path.join(testDir, 'integration.test.tsx'), integrationTestTemplate);
};

// Create package.json scripts
const packageJsonScripts = {
  "test": "jest",
  "test:watch": "jest --watch",
  "test:coverage": "jest --coverage",
  "test:ci": "jest --ci --coverage --watchAll=false",
  "test:e2e": "cypress run",
  "test:e2e:open": "cypress open",
  "test:all": "npm run test:ci && npm run test:e2e"
};

// Write configuration files
fs.writeFileSync('./jest.config.js', jestConfig);
fs.writeFileSync('./apps/id-dashboard/src/setupTests.ts', setupTests);
fs.writeFileSync('./apps/id-dashboard/src/test-utils.ts', testUtils);

// Create sample tests
createSampleTests();

console.log('✅ Jest configuration created');
console.log('✅ Test setup file created');
console.log('✅ Test utilities created');
console.log('✅ Sample test files created');
console.log('✅ Testing framework setup completed');

console.log('\n=== PHASE 3.4 COMPLETED ===');
console.log('Advanced testing implementation completed!');
console.log('- Jest configuration with TypeScript support');
console.log('- Comprehensive test setup with mocks');
console.log('- Test utilities and helpers');
console.log('- Sample test templates');
console.log('- Coverage thresholds set to 80%');
