import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { OnboardingWizard } from './OnboardingWizard';

// Mock the lucide-react icons
jest.mock('lucide-react', () => ({
  ChevronLeft: () => <div data-testid="chevron-left">←</div>,
  ChevronRight: () => <div data-testid="chevron-right">→</div>,
  X: () => <div data-testid="x">✕</div>,
  Info: () => <div data-testid="info">ℹ</div>,
  User: () => <div data-testid="user">👤</div>,
  Shield: () => <div data-testid="shield">🛡</div>,
  Download: () => <div data-testid="download">⬇</div>,
  Users: () => <div data-testid="users">👥</div>,
  Smartphone: () => <div data-testid="smartphone">📱</div>,
  Settings: () => <div data-testid="settings">⚙</div>,
  CheckCircle: () => <div data-testid="check-circle">✓</div>,
  SkipForward: () => <div data-testid="skip-forward">⏭</div>,
  HelpCircle: () => <div data-testid="help-circle">❓</div>,
}));

describe('OnboardingWizard', () => {
  const mockProps = {
    isOpen: true,
    onClose: jest.fn(),
    onComplete: jest.fn(),
    currentUser: { nickname: 'Test User' },
    onUpdateNickname: jest.fn(),
    onSetupCustodians: jest.fn(),
    onExportID: jest.fn(),
    onExportRecoveryKey: jest.fn(),
    onNavigateToSection: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the wizard when isOpen is true', () => {
    render(<OnboardingWizard {...mockProps} />);
    
    expect(screen.getByText('Welcome to Your Identity Dashboard!')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 8')).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(<OnboardingWizard {...mockProps} isOpen={false} />);
    
    expect(screen.queryByText('Welcome to Your Identity Dashboard!')).not.toBeInTheDocument();
  });

  it('shows info content when info button is clicked', () => {
    render(<OnboardingWizard {...mockProps} />);
    
    const infoButton = screen.getByTitle('More information');
    fireEvent.click(infoButton);
    
    expect(screen.getByText(/Your Identity Dashboard is your personal command center/)).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    render(<OnboardingWizard {...mockProps} />);
    
    const closeButton = screen.getByTitle('Close wizard');
    fireEvent.click(closeButton);
    
    expect(mockProps.onClose).toHaveBeenCalled();
  });

  it('calls onComplete when skip button is clicked', () => {
    render(<OnboardingWizard {...mockProps} />);
    
    const skipButton = screen.getByText('Skip Wizard');
    fireEvent.click(skipButton);
    
    expect(mockProps.onComplete).toHaveBeenCalled();
  });

  it('navigates to next step when next button is clicked', () => {
    render(<OnboardingWizard {...mockProps} />);
    
    const nextButton = screen.getByText('Next');
    fireEvent.click(nextButton);
    
    expect(screen.getByText('Set Your Identity Nickname')).toBeInTheDocument();
    expect(screen.getByText('Step 2 of 8')).toBeInTheDocument();
  });

  it('shows nickname input on nickname step', () => {
    render(<OnboardingWizard {...mockProps} />);
    
    // Navigate to nickname step
    const nextButton = screen.getByText('Next');
    fireEvent.click(nextButton);
    
    expect(screen.getByLabelText('Identity Nickname')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter a friendly nickname for this identity')).toBeInTheDocument();
  });

  it('calls onUpdateNickname when nickname is set', () => {
    render(<OnboardingWizard {...mockProps} />);
    
    // Navigate to nickname step
    const nextButton = screen.getByText('Next');
    fireEvent.click(nextButton);
    
    // Enter nickname
    const nicknameInput = screen.getByLabelText('Identity Nickname');
    fireEvent.change(nicknameInput, { target: { value: 'New Nickname' } });
    
    // Click set nickname button
    const setNicknameButton = screen.getByText('Set Nickname');
    fireEvent.click(setNicknameButton);
    
    expect(mockProps.onUpdateNickname).toHaveBeenCalledWith('New Nickname');
  });

  it('shows progress indicators for all steps', () => {
    render(<OnboardingWizard {...mockProps} />);
    
    // Should show 8 step indicators
    const stepIndicators = screen.getAllByText(/[1-8]/);
    expect(stepIndicators).toHaveLength(8);
  });
});
