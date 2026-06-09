import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SettingsPage } from '../Settings';
import { containerApi } from '../../utils/api';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('../../utils/api', () => ({
  containerApi: {
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
    getTailscaleStatus: vi.fn(),
  },
  authApi: {
    getStatus: vi.fn().mockResolvedValue({ data: { configured: true } }),
  }
}));

describe('SettingsPage', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
    (containerApi.getSettings as any).mockResolvedValue({
      data: {
        localNetworkIp: '192.168.1.100',
        tailscaleIp: '100.1.1.1',
        tailscaleHostname: 'nas',
      }
    });
    // @ts-ignore
    delete window.location;
    window.location = { ...originalLocation, hostname: '192.168.1.50' } as any;
  });

  afterEach(() => {
    window.location = originalLocation;
  });

  it('renders settings inputs', async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('192.168.1.100')).toBeInTheDocument();
      expect(screen.getByDisplayValue('100.1.1.1')).toBeInTheDocument();
      expect(screen.getByDisplayValue('nas')).toBeInTheDocument();
    });
  });

  it('auto-detects Local IP from window.location.hostname', async () => {
    render(<SettingsPage />);
    await waitFor(() => screen.getByDisplayValue('192.168.1.100'));

    const autoDetectBtn = screen.getByRole('button', { name: /Auto-detect/i });
    fireEvent.click(autoDetectBtn);

    await waitFor(() => {
      expect(screen.getByDisplayValue('192.168.1.50')).toBeInTheDocument();
    });
  });

  it('opens Select Device modal when clicking Select Device for Tailscale', async () => {
    (containerApi.getTailscaleStatus as any).mockResolvedValue({ data: { Peer: {} } });
    render(<SettingsPage />);
    await waitFor(() => screen.getByDisplayValue('192.168.1.100'));

    const selectDeviceBtns = screen.getAllByRole('button', { name: /Select Device/i });
    fireEvent.click(selectDeviceBtns[0]); // Click the first one

    await waitFor(() => {
      expect(screen.getByText(/Select Target Device/i)).toBeInTheDocument();
    });
  });
});
