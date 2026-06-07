import { useState, useEffect, useCallback } from 'react';
import { containerApi, TailscaleStatus } from '../utils/api';

export function useTailscaleStatus() {
  const [status, setStatus] = useState<TailscaleStatus | null>(null);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [deletingPeer, setDeletingPeer] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await containerApi.getTailscaleStatus();
      setStatus(res.data);
      setError('');
    } catch (err: any) {
      if (err.response?.status === 503) {
        setError('Tailscale not found or not accessible on the host.');
      } else {
        setError('Failed to load Tailscale status.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000); // refresh every 15s
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleAuth = async (authKey: string) => {
    if (!authKey.trim()) return false;
    setAuthLoading(true);
    try {
      await containerApi.authTailscale(authKey.trim());
      await fetchStatus(); // Refresh status immediately after auth
      return true;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to authenticate');
      return false;
    } finally {
      setAuthLoading(false);
    }
  };

  const handleDeleteDevice = async (deviceId: string, apiKey: string) => {
    setDeletingPeer(deviceId);
    try {
      await containerApi.deleteTailscaleDevice(deviceId, apiKey);
      // Optimistically update status
      setStatus((prev) => {
        if (!prev || !prev.Peer) return prev;
        const newPeers = { ...prev.Peer };
        const peerKey = Object.keys(newPeers).find(k => newPeers[k].ID === deviceId);
        if (peerKey) delete newPeers[peerKey];
        return { ...prev, Peer: newPeers };
      });
      return true;
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to delete device';
      alert(msg);
      return false;
    } finally {
      setDeletingPeer(null);
    }
  };

  return {
    status,
    error,
    loading,
    authLoading,
    deletingPeer,
    refresh: fetchStatus,
    handleAuth,
    handleDeleteDevice
  };
}
