import React, { useState, useMemo } from 'react';
import { useTailscaleStatus } from '../hooks/useTailscaleStatus';
import { TailscalePeer, containerApi, Container } from '../utils/api';
import { TailscaleLoadingSkeleton } from '../components/tailscale/TailscaleLoadingSkeleton';
import { TailscaleErrorState } from '../components/tailscale/TailscaleErrorState';
import { TailscaleLoginCard } from '../components/tailscale/TailscaleLoginCard';
import { DeleteDeviceDialog } from '../components/tailscale/DeleteDeviceDialog';
import { useEffect, useCallback } from 'react';

// --- Helpers ---
const copyToClipboard = (text: string) => {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text);
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
};

const formatLastSeen = (ts?: string) => {
  if (!ts) return 'Unknown';
  const d = new Date(ts);
  const now = Date.now();
  const diff = Math.floor((now - d.getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

const getOSIcon = (os: string) => {
  const l = os.toLowerCase();
  if (l.includes('linux')) return '🐧';
  if (l.includes('windows')) return '🪟';
  if (l.includes('macos') || l.includes('darwin')) return '🍎';
  if (l.includes('ios')) return '📱';
  if (l.includes('android')) return '🤖';
  return '💻';
};

// --- Sub-components ---

const StatusDot: React.FC<{ online: boolean; size?: string }> = ({ online, size = 'w-2.5 h-2.5' }) => (
  <div className={`${size} rounded-full ${online ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.4)]' : 'bg-slate-600'}`} />
);

interface TailscalePageProps {}

export const TailscalePage: React.FC<TailscalePageProps> = () => {
  const { status, error, loading, authLoading, deletingPeer, refresh, handleAuth, handleDeleteDevice } = useTailscaleStatus();
  const [deviceToDelete, setDeviceToDelete] = useState<{ id: string; name: string } | null>(null);
  const [containers, setContainers] = useState<Container[]>([]);
  const [lastSynced, setLastSynced] = useState<Date>(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [osFilter, setOsFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [copied, setCopied] = useState<string | null>(null);

  // Fetch containers for published services
  const fetchContainers = useCallback(async () => {
    try {
      const res = await containerApi.getContainers();
      setContainers(res.data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchContainers();
    const interval = setInterval(fetchContainers, 15000);
    return () => clearInterval(interval);
  }, [fetchContainers]);

  useEffect(() => {
    if (status) setLastSynced(new Date());
  }, [status]);

  const handleCopy = (text: string, id: string) => {
    copyToClipboard(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  // All computed values MUST be before any early return (React hooks rule)
  const tailscaleAvailable = !loading && !error && !!status && status.BackendState !== 'NeedsLogin';
  const peers = tailscaleAvailable && status?.Peer ? Object.values(status.Peer) : [];
  const selfNode = tailscaleAvailable ? status?.Self : null;
  const onlineCount = peers.filter(p => p.Online).length;
  const publishedServices = containers.filter(c => c.isPublished && c.status === 'running');
  const tailscaleIp = selfNode?.TailscaleIPs?.[0] || '';
  const syncAgo = Math.floor((Date.now() - lastSynced.getTime()) / 1000);

  // Filters — useMemo must always run (no conditional hooks)
  const filteredPeers = useMemo(() => {
    return peers.filter(p => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchName = p.HostName?.toLowerCase().includes(q);
        const matchIP = p.TailscaleIPs?.some(ip => ip.includes(q));
        const matchDNS = p.DNSName?.toLowerCase().includes(q);
        if (!matchName && !matchIP && !matchDNS) return false;
      }
      if (statusFilter === 'online' && !p.Online) return false;
      if (statusFilter === 'offline' && p.Online) return false;
      if (osFilter !== 'all' && !p.OS?.toLowerCase().includes(osFilter)) return false;
      return true;
    });
  }, [peers, searchQuery, statusFilter, osFilter]);

  const uniqueOSes = Array.from(new Set(peers.map(p => p.OS?.toLowerCase().split(' ')[0] || 'unknown')));

  // Early return AFTER all hooks
  if (loading) return <div className="flex-1 overflow-auto bg-slate-900 p-8"><TailscaleLoadingSkeleton /></div>;

  return (
    <div className="flex-1 overflow-auto bg-slate-900">
      <div className="p-8">
        {/* Top Status Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2.5 px-4 py-2 rounded-xl border ${tailscaleAvailable ? 'bg-green-500/10 border-green-500/20' : 'bg-slate-800 border-slate-700/50'}`}>
              <StatusDot online={tailscaleAvailable} />
              <span className={`font-semibold text-sm ${tailscaleAvailable ? 'text-green-400' : 'text-slate-400'}`}>
                {tailscaleAvailable ? 'Tailnet Connected' : error ? 'Tailscale Unavailable' : 'Not Connected'}
              </span>
            </div>
            {tailscaleAvailable && (
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span className="px-2.5 py-1 bg-slate-800 rounded-lg border border-slate-700/50 font-mono">{peers.length} devices</span>
                <span className="px-2.5 py-1 bg-slate-800 rounded-lg border border-slate-700/50 font-mono">{onlineCount} online</span>
                <span className="px-2.5 py-1 bg-slate-800 rounded-lg border border-slate-700/50 font-mono">{publishedServices.length} published</span>
                <span className="text-slate-500">synced {syncAgo}s ago</span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={refresh}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700/50 text-slate-200 text-sm font-medium rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" /></svg>
              Refresh
            </button>
            <a
              href="https://login.tailscale.com/admin/machines"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700/50 text-slate-200 text-sm font-medium rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
              Admin Console
            </a>
          </div>
        </div>

        {/* Error / Login inline blocks */}
        {error && (
          <div className="bg-red-500/5 rounded-xl border border-red-500/15 p-5 mb-6 flex items-center gap-4">
            <div className="w-10 h-10 bg-red-500/10 rounded-full flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
            </div>
            <div>
              <p className="text-sm font-medium text-red-400">Tailscale is not available</p>
              <p className="text-xs text-slate-500 mt-0.5">{error}</p>
            </div>
            <button onClick={refresh} className="ml-auto px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700/50 transition-colors">Retry</button>
          </div>
        )}

        {status?.BackendState === 'NeedsLogin' && (
          <div className="mb-6">
            <TailscaleLoginCard authURL={status.AuthURL} onAuth={handleAuth} loading={authLoading} />
          </div>
        )}

        {/* 3-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Left Column: This SBC */}
          <div className="lg:col-span-3">
            {selfNode && (
              <div className="bg-slate-800/60 rounded-xl border border-slate-700/40 p-5 sticky top-8">
                <div className="flex items-center gap-2 mb-4">
                  <StatusDot online={selfNode.Online} size="w-3 h-3" />
                  <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">This Device</h3>
                </div>

                <div className="mb-4">
                  <p className="text-lg font-bold text-slate-100 tracking-tight">{selfNode.HostName}</p>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-500/10 text-green-400 text-[10px] font-bold uppercase rounded-md border border-green-500/20 mt-1">Online</span>
                </div>

                <div className="space-y-3 text-xs">
                  {/* Tailscale IP */}
                  <div>
                    <p className="text-slate-500 font-semibold uppercase tracking-wider mb-1">Tailscale IP</p>
                    <button
                      onClick={() => handleCopy(tailscaleIp, 'self-ip')}
                      className="flex items-center gap-2 w-full px-3 py-2 bg-slate-900/50 rounded-lg border border-slate-700/50 text-slate-300 font-mono hover:border-slate-600 transition-colors group"
                    >
                      <span className="flex-1 text-left truncate">{tailscaleIp}</span>
                      <svg className={`w-3.5 h-3.5 ${copied === 'self-ip' ? 'text-green-400' : 'text-slate-500 group-hover:text-slate-300'} transition-colors`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" /></svg>
                    </button>
                  </div>

                  {/* MagicDNS */}
                  {selfNode.DNSName && (
                    <div>
                      <p className="text-slate-500 font-semibold uppercase tracking-wider mb-1">MagicDNS</p>
                      <button
                        onClick={() => handleCopy(selfNode.DNSName || '', 'self-dns')}
                        className="flex items-center gap-2 w-full px-3 py-2 bg-slate-900/50 rounded-lg border border-slate-700/50 text-slate-300 font-mono text-[11px] hover:border-slate-600 transition-colors group"
                      >
                        <span className="flex-1 text-left truncate">{selfNode.DNSName.replace(/\.$/, '')}</span>
                        <svg className={`w-3.5 h-3.5 shrink-0 ${copied === 'self-dns' ? 'text-green-400' : 'text-slate-500 group-hover:text-slate-300'} transition-colors`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" /></svg>
                      </button>
                    </div>
                  )}

                  {/* Details */}
                  <div className="pt-2 border-t border-slate-700/40 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-500">OS</span>
                      <span className="text-slate-300">{getOSIcon(selfNode.OS)} {selfNode.OS}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Connection</span>
                      <span className="text-green-400">Direct</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Center Column: Peer Devices */}
          <div className="lg:col-span-6">
            <div className="bg-slate-800/60 rounded-xl border border-slate-700/40 overflow-hidden">
              {/* Filters */}
              <div className="p-4 border-b border-slate-700/40">
                <div className="flex flex-wrap gap-3">
                  <input
                    type="text"
                    placeholder="Search by name or IP..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="flex-1 min-w-[200px] px-3 py-2 bg-slate-900/50 text-slate-100 text-sm rounded-lg border border-slate-700 focus:border-slate-500 outline-none transition-colors"
                  />
                  <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    className="px-3 py-2 bg-slate-900/50 text-slate-100 text-sm rounded-lg border border-slate-700 focus:border-slate-500 outline-none"
                  >
                    <option value="all">All Status</option>
                    <option value="online">Online</option>
                    <option value="offline">Offline</option>
                  </select>
                  <select
                    value={osFilter}
                    onChange={e => setOsFilter(e.target.value)}
                    className="px-3 py-2 bg-slate-900/50 text-slate-100 text-sm rounded-lg border border-slate-700 focus:border-slate-500 outline-none"
                  >
                    <option value="all">All OS</option>
                    {uniqueOSes.map(os => (
                      <option key={os} value={os}>{os.charAt(0).toUpperCase() + os.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-900/30">
                    <tr>
                      <th className="px-4 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Device</th>
                      <th className="px-4 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">OS</th>
                      <th className="px-4 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Tailscale IP</th>
                      <th className="px-4 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Last Seen</th>
                      <th className="px-4 py-3 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {filteredPeers.map(peer => (
                      <tr key={peer.ID} className="hover:bg-slate-700/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <StatusDot online={peer.Online} />
                            <span className="text-sm font-medium text-slate-200">{peer.HostName || 'Unknown'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 text-[10px] font-bold uppercase rounded-md ${peer.Online ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-slate-700/50 text-slate-500 border border-slate-600/30'}`}>
                            {peer.Online ? 'Online' : 'Offline'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-400">
                          <span className="mr-1">{getOSIcon(peer.OS)}</span>
                          {peer.OS}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleCopy(peer.TailscaleIPs?.[0] || '', `peer-${peer.ID}`)}
                            className="font-mono text-xs text-slate-300 hover:text-slate-100 bg-slate-900/40 px-2 py-1 rounded border border-slate-700/50 hover:border-slate-600 transition-colors"
                          >
                            {peer.TailscaleIPs?.[0] || '—'}
                            {copied === `peer-${peer.ID}` && <span className="ml-1 text-green-400">✓</span>}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {peer.Online ? 'Now' : formatLastSeen((peer as any).LastSeen)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => setDeviceToDelete({ id: peer.ID, name: peer.HostName })}
                            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                            title="Remove device"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredPeers.length === 0 && (
                <div className="text-center py-10 text-slate-500 text-sm">
                  {peers.length === 0 ? 'No devices in tailnet' : 'No devices match filters'}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Published Services */}
          <div className="lg:col-span-3">
            <div className="bg-slate-800/60 rounded-xl border border-slate-700/40 p-5 sticky top-8">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg>
                <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Published via Tailnet</h3>
              </div>

              {publishedServices.length === 0 ? (
                <p className="text-xs text-slate-500 italic py-4">No published services detected</p>
              ) : (
                <div className="space-y-2">
                  {publishedServices.map(svc => (
                    <div key={svc.id} className="bg-slate-900/40 rounded-lg border border-slate-700/50 p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium text-slate-200">{svc.displayName}</span>
                        <span className={`w-2 h-2 rounded-full ${svc.health === 'healthy' ? 'bg-green-400' : svc.health === 'unhealthy' ? 'bg-red-400' : 'bg-slate-500'}`} />
                      </div>
                      {svc.ports.filter(p => p.publicPort).map((port, idx) => {
                        const url = `http://${tailscaleIp}:${port.publicPort}`;
                        return (
                          <div key={idx} className="flex items-center gap-1.5 mt-1">
                            <span className="font-mono text-[11px] text-slate-400 flex-1 truncate">{tailscaleIp}:{port.publicPort}</span>
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors"
                              title="Open"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                            </a>
                            <button
                              onClick={() => handleCopy(url, `svc-${svc.id}-${idx}`)}
                              className="p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 rounded transition-colors"
                              title="Copy URL"
                            >
                              {copied === `svc-${svc.id}-${idx}` ? (
                                <svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                              ) : (
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" /></svg>
                              )}
                            </button>
                          </div>
                        );
                      })}
                      <div className="flex items-center gap-1.5 mt-2 text-[10px] text-slate-500">
                        <span className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700/50">{svc.image.split('/').pop()?.split(':')[0]}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {deviceToDelete && (
        <DeleteDeviceDialog
          deviceName={deviceToDelete.name}
          isDeleting={deletingPeer === deviceToDelete.id}
          onConfirm={async (apiKey: string) => {
            const success = await handleDeleteDevice(deviceToDelete.id, apiKey);
            if (success) setDeviceToDelete(null);
          }}
          onCancel={() => setDeviceToDelete(null)}
        />
      )}
    </div>
  );
};
