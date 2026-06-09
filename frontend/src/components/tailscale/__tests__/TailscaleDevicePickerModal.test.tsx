import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TailscaleDevicePickerModal } from '../TailscaleDevicePickerModal';
import { containerApi } from '../../../utils/api';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../../utils/api', () => ({
  containerApi: {
    getTailscaleStatus: vi.fn(),
  },
}));

describe('TailscaleDevicePickerModal', () => {
  const mockOnClose = vi.fn();
  const mockOnSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially', () => {
    (containerApi.getTailscaleStatus as any).mockResolvedValueOnce({ data: {} });
    render(<TailscaleDevicePickerModal onClose={mockOnClose} onSelect={mockOnSelect} />);
    expect(screen.getByText(/Scanning Tailnet/i)).toBeInTheDocument();
  });

  it('renders peers from tailscale API', async () => {
    (containerApi.getTailscaleStatus as any).mockResolvedValueOnce({
      data: {
        Peer: {
          'peer1': { HostName: 'NAS', TailscaleIPs: ['100.1.1.1'] },
          'peer2': { HostName: 'MacBook', TailscaleIPs: ['100.2.2.2'] },
        }
      }
    });

    Object.defineProperty(window, 'location', {
      value: { hostname: '100.9.9.9' },
      writable: true,
    });

    render(<TailscaleDevicePickerModal onClose={mockOnClose} onSelect={mockOnSelect} />);

    await waitFor(() => {
      expect(screen.getByText('NAS')).toBeInTheDocument();
      expect(screen.getByText('100.1.1.1')).toBeInTheDocument();
      expect(screen.getByText('MacBook')).toBeInTheDocument();
    });
  });

  it('calls onSelect when a peer is clicked', async () => {
    (containerApi.getTailscaleStatus as any).mockResolvedValueOnce({
      data: {
        Peer: {
          'peer1': { HostName: 'NAS', TailscaleIPs: ['100.1.1.1'] },
        }
      }
    });

    Object.defineProperty(window, 'location', {
      value: { hostname: 'nas.ts.net' },
      writable: true,
    });

    render(<TailscaleDevicePickerModal onClose={mockOnClose} onSelect={mockOnSelect} />);

    await waitFor(() => expect(screen.getByText('NAS')).toBeInTheDocument());
    fireEvent.click(screen.getByText('NAS'));

    expect(mockOnSelect).toHaveBeenCalledWith('100.1.1.1', 'NAS');
  });

  it('calls onClose when close button is clicked', async () => {
    (containerApi.getTailscaleStatus as any).mockResolvedValueOnce({ data: { Peer: {} } });
    render(<TailscaleDevicePickerModal onClose={mockOnClose} onSelect={mockOnSelect} />);

    await waitFor(() => expect(screen.getByRole('button', { name: /Close/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Close/i }));

    expect(mockOnClose).toHaveBeenCalled();
  });
});
