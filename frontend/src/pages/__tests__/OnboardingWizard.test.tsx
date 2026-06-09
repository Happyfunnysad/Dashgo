import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OnboardingWizard } from '../OnboardingWizard';
import { authApi, containerApi } from '../../utils/api';
import { authStorage } from '../../utils/authStorage';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../utils/api', () => ({
  authApi: { setup: vi.fn() },
  containerApi: {
    getTailscaleStatus: vi.fn(),
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
  },
}));

vi.mock('../../utils/authStorage', () => ({
  authStorage: { setToken: vi.fn() },
}));

describe('OnboardingWizard', () => {
  const mockOnComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Step 1 initially and handles password setup', async () => {
    (authApi.setup as any).mockResolvedValueOnce({ data: { token: 'mock-token' } });

    render(<OnboardingWizard onComplete={mockOnComplete} />);
    expect(screen.getByText(/1. Set Admin Password/i)).toBeInTheDocument();

    const inputs = screen.getAllByPlaceholderText('••••••••');
    fireEvent.change(inputs[0], { target: { value: 'password123' } });
    fireEvent.change(inputs[1], { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Password/i }));

    await waitFor(() => {
      expect(authApi.setup).toHaveBeenCalledWith('password123');
      expect(authStorage.setToken).toHaveBeenCalledWith('mock-token');
      // Should move to step 2
      expect(screen.getByText(/2. Connect Tailscale/i)).toBeInTheDocument();
    });
  });

  it('allows skipping Tailscale setup (Step 2 -> Step 3)', async () => {
    // Start at Step 1 and advance to Step 2
    (authApi.setup as any).mockResolvedValueOnce({ data: { token: 'mock' } });
    (containerApi.getTailscaleStatus as any).mockResolvedValue({ data: { BackendState: 'NeedsLogin' } });

    render(<OnboardingWizard onComplete={mockOnComplete} />);
    
    // Fill password to advance
    const inputs = screen.getAllByPlaceholderText('••••••••');
    fireEvent.change(inputs[0], { target: { value: 'pass' } });
    fireEvent.change(inputs[1], { target: { value: 'pass' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Password/i }));

    await waitFor(() => expect(screen.getByText(/2. Connect Tailscale/i)).toBeInTheDocument());

    // Click Configure Later
    fireEvent.click(screen.getByRole('button', { name: /Configure Later/i }));

    await waitFor(() => {
      expect(screen.getByText(/3. Network Settings/i)).toBeInTheDocument();
    });
  });

  it('allows saving network settings (Step 3 -> Finish)', async () => {
    (authApi.setup as any).mockResolvedValueOnce({ data: { token: 'mock' } });
    (containerApi.getTailscaleStatus as any).mockResolvedValue({ data: {} });
    (containerApi.getSettings as any).mockResolvedValueOnce({ data: { localNetworkIp: 'old' } });
    (containerApi.updateSettings as any).mockResolvedValueOnce({ data: {} });

    render(<OnboardingWizard onComplete={mockOnComplete} />);
    
    // Step 1
    const inputs = screen.getAllByPlaceholderText('••••••••');
    fireEvent.change(inputs[0], { target: { value: 'pass' } });
    fireEvent.change(inputs[1], { target: { value: 'pass' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Password/i }));

    // Step 2
    await waitFor(() => expect(screen.getByText(/2. Connect Tailscale/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Skip/i }));

    // Step 3
    await waitFor(() => expect(screen.getByText(/3. Network Settings/i)).toBeInTheDocument());
    
    fireEvent.click(screen.getByRole('button', { name: /Finish Setup/i }));

    await waitFor(() => {
      expect(containerApi.updateSettings).toHaveBeenCalled();
      expect(mockOnComplete).toHaveBeenCalled();
    });
  });

  it('populates Local Network IP on Auto click', async () => {
    // Hack to jump straight to step 3 by mocking state? Actually we just run through steps 1 and 2
    (authApi.setup as any).mockResolvedValueOnce({ data: { token: 'mock' } });
    (containerApi.getTailscaleStatus as any).mockResolvedValue({ data: {} });

    render(<OnboardingWizard onComplete={mockOnComplete} />);
    
    const passInputs = screen.getAllByPlaceholderText('••••••••');
    fireEvent.change(passInputs[0], { target: { value: 'pass' } });
    fireEvent.change(passInputs[1], { target: { value: 'pass' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Password/i }));

    await waitFor(() => expect(screen.getByText(/2. Connect Tailscale/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Skip/i }));

    await waitFor(() => expect(screen.getByText(/3. Network Settings/i)).toBeInTheDocument());

    const inputs = screen.getAllByRole('textbox');
    const localIpInput = inputs[0] as HTMLInputElement;

    // Click Auto
    fireEvent.click(screen.getByRole('button', { name: /Auto/i }));
    
    await waitFor(() => {
      expect(localIpInput.value).toBe(window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' ? window.location.hostname : '');
    });
  });
});
