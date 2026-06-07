import React, { useState, useRef, useEffect } from 'react';
import { TailscalePeer } from '../../utils/api';
import { copyToClipboard } from '../../utils/formatters';

interface PeerRowProps {
  peer: TailscalePeer;
  isDeleting: boolean;
  onDeleteClick: (id: string, name: string) => void;
}

export const PeerRow: React.FC<PeerRowProps> = ({ peer, isDeleting, onDeleteClick }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const ip = peer.TailscaleIPs?.[0] || '';
  const dnsName = peer.DNSName ? peer.DNSName.replace(/\.$/, '') : '';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpen]);

  const handleCopyIP = () => {
    if (!ip) return;
    copyToClipboard(ip).then(() => {
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        setMenuOpen(false);
      }, 1000);
    }).catch(err => {
      console.error('Failed to copy: ', err);
    });
  };

  return (
    <div className="flex items-center min-h-[64px] py-3 border-b border-gray-700/30 last:border-0 hover:bg-gray-800/50 transition px-2 -mx-2 rounded-lg group">
      {/* Status indicator */}
      <div className="shrink-0 flex items-center justify-center w-8">
        <div className={`w-2.5 h-2.5 rounded-full ${peer.Online ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-gray-600'}`}></div>
      </div>

      {/* Main Info */}
      <div className="flex-1 min-w-0 pr-4">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-gray-200 font-medium text-sm truncate" title={peer.HostName}>
            {peer.HostName}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-gray-500">
          <span className="text-gray-400">{ip}</span>
          {dnsName && (
            <>
              <span className="text-gray-600">·</span>
              <span className="truncate max-w-[140px] md:max-w-[200px]" title={dnsName}>{dnsName}</span>
            </>
          )}
        </div>
      </div>

      {/* OS Badge */}
      <div className="hidden sm:flex shrink-0 mr-4">
        <span className="text-[10px] text-gray-400 uppercase bg-gray-800/80 border border-gray-700 px-1.5 py-0.5 rounded font-medium">
          {peer.OS}
        </span>
      </div>

      {/* Menu / Actions */}
      <div className="shrink-0 relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition"
          aria-label="Options"
          aria-expanded={menuOpen}
        >
          {isDeleting ? (
            <div className="w-4 h-4 border-2 border-gray-500 border-t-gray-300 rounded-full animate-spin"></div>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
            </svg>
          )}
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-10 py-1 overflow-hidden">
            <button
              onClick={handleCopyIP}
              className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition flex items-center gap-2"
            >
              {copied ? (
                <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
              {copied ? 'Copied!' : 'Copy IP Address'}
            </button>
            <div className="h-px bg-gray-700 my-1"></div>
            <button
              onClick={() => {
                setMenuOpen(false);
                onDeleteClick(peer.ID, peer.HostName);
              }}
              disabled={isDeleting}
              className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-400/10 transition flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Remove from Tailnet
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
