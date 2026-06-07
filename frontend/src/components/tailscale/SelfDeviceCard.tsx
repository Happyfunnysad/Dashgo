import React, { useState } from 'react';
import { TailscalePeer } from '../../utils/api';
import { copyToClipboard as copyText } from '../../utils/formatters';

interface SelfDeviceCardProps {
  selfNode: TailscalePeer;
}

export const SelfDeviceCard: React.FC<SelfDeviceCardProps> = ({ selfNode }) => {
  const [copiedIP, setCopiedIP] = useState(false);
  const [copiedDNS, setCopiedDNS] = useState(false);

  const ip = selfNode.TailscaleIPs?.[0] || '';
  const dnsName = selfNode.DNSName ? selfNode.DNSName.replace(/\.$/, '') : '';

  const copyToClipboard = (text: string, isIP: boolean) => {
    if (!text) return;
    copyText(text).then(() => {
      if (isIP) {
        setCopiedIP(true);
        setTimeout(() => setCopiedIP(false), 2000);
      } else {
        setCopiedDNS(true);
        setTimeout(() => setCopiedDNS(false), 2000);
      }
    }).catch(err => {
      console.error('Failed to copy:', err);
    });
  };

  return (
    <div className="flex flex-col h-full bg-gray-800 rounded-xl md:rounded-r-none md:rounded-l-xl p-6 border-b md:border-b-0 md:border-r border-gray-700/50">
      <div className="mb-8">
        <div className="text-xs font-bold tracking-wider text-gray-500 mb-4">YOUR DEVICE</div>
        
        <div className="flex items-start gap-4">
          <div className="relative shrink-0">
            <div className="w-12 h-12 bg-gray-900 rounded-xl flex items-center justify-center border border-gray-700 text-2xl shadow-inner">
              🛡️
            </div>
            <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-[3px] border-gray-800 ${selfNode.Online === false ? 'bg-gray-500' : 'bg-green-500'}`}></div>
          </div>
          
          <div className="pt-1 overflow-hidden">
            <h3 className="text-white font-bold text-lg truncate" title={selfNode.HostName}>
              {selfNode.HostName}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="bg-gray-700/50 text-gray-300 text-xs px-2 py-0.5 rounded uppercase font-medium border border-gray-600/50">
                {selfNode.OS}
              </span>
              <span className="text-xs text-gray-500">This device</span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-5 mt-auto">
        {/* IP Address */}
        <div>
          <div className="text-xs text-gray-500 font-medium mb-1.5">Tailscale IP</div>
          <div className="flex items-center justify-between group bg-gray-900/50 rounded-lg p-2.5 border border-transparent hover:border-gray-700/50 transition">
            <span className="font-mono text-blue-400 text-sm">{ip}</span>
            <button 
              onClick={() => copyToClipboard(ip, true)}
              className="text-gray-500 hover:text-white transition p-1 rounded hover:bg-gray-700 opacity-0 group-hover:opacity-100 focus:opacity-100"
              aria-label="Copy IP address"
            >
              {copiedIP ? (
                <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* DNS Name */}
        {dnsName && (
          <div>
            <div className="text-xs text-gray-500 font-medium mb-1.5">DNS name</div>
            <div className="flex items-center justify-between group bg-gray-900/50 rounded-lg p-2.5 border border-transparent hover:border-gray-700/50 transition">
              <span className="font-mono text-gray-300 text-sm truncate mr-2" title={dnsName}>{dnsName}</span>
              <button 
                onClick={() => copyToClipboard(dnsName, false)}
                className="text-gray-500 hover:text-white transition p-1 rounded hover:bg-gray-700 opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0"
                aria-label="Copy DNS name"
              >
                {copiedDNS ? (
                  <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
