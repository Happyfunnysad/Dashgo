import React, { useState, useEffect, useMemo } from 'react';
import { containerApi, TailscalePeer } from '../../utils/api';

interface Props {
  onClose: () => void;
  onSelect: (ip: string, hostname: string) => void;
}

export const TailscaleDevicePickerModal: React.FC<Props> = ({ onClose, onSelect }) => {
  const [peers, setPeers] = useState<TailscalePeer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchPeers = async () => {
      try {
        const res = await containerApi.getTailscaleStatus();
        const status = res.data;
        let allPeers: TailscalePeer[] = [];
        if (status?.Self) {
          allPeers.push({
             ID: 'self',
             HostName: status.Self.HostName,
             DNSName: status.Self.DNSName,
             OS: status.Self.OS,
             TailscaleIPs: status.Self.TailscaleIPs,
             Online: status.Self.Online,
          });
        }
        if (status?.Peer) {
          allPeers = [...allPeers, ...Object.values(status.Peer)];
        }
        setPeers(allPeers);
      } catch (err) {
        setError('Failed to fetch Tailscale network devices');
      } finally {
        setLoading(false);
      }
    };
    fetchPeers();
  }, []);

  const filteredPeers = useMemo(() => {
    return peers.filter(p => {
      const q = search.toLowerCase();
      const matchName = p.HostName?.toLowerCase().includes(q);
      const matchIP = p.TailscaleIPs?.some(ip => ip.includes(q));
      return matchName || matchIP;
    });
  }, [peers, search]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/50 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/30">
          <h3 className="text-lg font-bold text-slate-100">Select Target Device</h3>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-200 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="p-4 border-b border-slate-800">
          <input
            type="text"
            autoFocus
            placeholder="Search by name or IP..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-3 py-2 bg-slate-950/50 text-slate-100 text-sm rounded-lg border border-slate-700 focus:border-blue-500 outline-none transition-colors"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
             <div className="p-8 text-center text-slate-400 text-sm flex flex-col items-center gap-3">
               <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" /><path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" className="opacity-75" /></svg>
               Scanning Tailnet...
             </div>
          ) : error ? (
             <div className="p-8 text-center text-red-400 text-sm">{error}</div>
          ) : filteredPeers.length === 0 ? (
             <div className="p-8 text-center text-slate-500 text-sm">No devices found</div>
          ) : (
            <div className="space-y-1">
              {filteredPeers.map(peer => (
                <button
                  key={peer.ID}
                  onClick={() => onSelect(peer.TailscaleIPs?.[0] || '', peer.DNSName ? peer.DNSName.replace(/\.$/, '') : peer.HostName)}
                  className="w-full text-left p-3 rounded-lg hover:bg-slate-800 transition-colors group flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${peer.Online ? 'bg-green-400' : 'bg-slate-600'}`} />
                      <span className="font-semibold text-slate-200">{peer.HostName}</span>
                      {peer.ID === 'self' && <span className="text-[10px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded uppercase font-bold border border-blue-500/20">dashgo sidecar</span>}
                    </div>
                    <div className="text-xs text-slate-500 font-mono mt-1 ml-4">
                      {peer.TailscaleIPs?.[0]}
                    </div>
                  </div>
                  <span className="text-xs text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">Select</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
