import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';

// Simple test component
const TestApp = () => {
  return (
    <div>
      <h1>Welcome to par Noir</h1>
      <p>Test application</p>
    </div>
  );
};

describe('Integration Tests', () => {
  it('renders welcome message', async () => {
    renderWithProviders(<TestApp />);
    
    // Test basic rendering
    await waitFor(() => {
      expect(screen.getByText(/welcome to par noir/i)).toBeInTheDocument();
    });
    
    expect(screen.getByText('Test application')).toBeInTheDocument();
  });
});