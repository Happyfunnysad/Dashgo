import React from 'react';
import { TailscalePeer } from '../../utils/api';
import { PeerRow } from './PeerRow';

interface PeerListProps {
  peers: TailscalePeer[];
  deletingPeer: string | null;
  onDeleteClick: (id: string, name: string) => void;
}

export const PeerList: React.FC<PeerListProps> = ({ peers, deletingPeer, onDeleteClick }) => {
  const onlineCount = peers.filter(p => p.Online).length;

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-800 rounded-xl md:rounded-l-none md:rounded-r-xl p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="text-xs font-bold tracking-wider text-gray-500">NETWORK DEVICES</div>
        <div className="text-sm font-medium text-gray-400">
          <span className="text-white">{onlineCount}</span> / {peers.length} online
        </div>
      </div>

      {peers.length > 0 ? (
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 -mr-1">
          {peers.map((peer) => (
            <PeerRow 
              key={peer.ID} 
              peer={peer} 
              isDeleting={deletingPeer === peer.ID}
              onDeleteClick={onDeleteClick}
            />
          ))}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center border-2 border-dashed border-gray-700/50 rounded-lg p-6 text-center">
          <div>
            <div className="text-gray-500 text-4xl mb-3">📭</div>
            <h4 className="text-gray-300 font-medium mb-1">No other devices found</h4>
            <p className="text-sm text-gray-500 max-w-[200px] mx-auto">
              This server is connected, but your Tailnet does not contain any additional devices yet.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
