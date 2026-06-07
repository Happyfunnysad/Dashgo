import React, { useState } from 'react';
import { useTailscaleStatus } from '../../hooks/useTailscaleStatus';
import { TailscalePeer } from '../../utils/api';
import { TailscaleLoadingSkeleton } from './TailscaleLoadingSkeleton';
import { TailscaleErrorState } from './TailscaleErrorState';
import { TailscaleLoginCard } from './TailscaleLoginCard';
import { SelfDeviceCard } from './SelfDeviceCard';
import { PeerList } from './PeerList';
import { DeleteDeviceDialog } from './DeleteDeviceDialog';

export const TailscaleWidget: React.FC = () => {
  const {
    status,
    error,
    loading,
    authLoading,
    deletingPeer,
    refresh,
    handleAuth,
    handleDeleteDevice
  } = useTailscaleStatus();

  const [deviceToDelete, setDeviceToDelete] = useState<{ id: string, name: string } | null>(null);

  if (loading) {
    return <TailscaleLoadingSkeleton />;
  }

  if (error) {
    return <TailscaleErrorState error={error} onRetry={refresh} />;
  }

  if (!status) return null;

  if (status.BackendState === 'NeedsLogin') {
    return (
      <TailscaleLoginCard 
        authURL={status.AuthURL} 
        onAuth={handleAuth} 
        loading={authLoading} 
      />
    );
  }

  const peers = status.Peer ? Object.values(status.Peer) : [];
  const selfNode = status.Self;

  return (
    <div className="flex flex-col">
      {/* Top Status Bar */}
      <div className="flex items-center gap-2 mb-6 text-sm">
        <div className="flex items-center gap-2 px-3 py-1 bg-gray-800 rounded-full border border-gray-700">
          <div className="w-2 h-2 rounded-full bg-green-500"></div>
          <span className="text-gray-300 font-medium">Connected</span>
        </div>
        <span className="text-gray-500">
          {peers.filter(p => p.Online).length} / {peers.length} devices online
        </span>
      </div>

      {/* Main Dashboard Layout */}
      <div className="flex flex-col md:flex-row bg-gray-800 rounded-xl border border-gray-700/50 shadow-sm min-h-[400px]">
        {selfNode && (
          <div className="w-full md:w-80 shrink-0">
            <SelfDeviceCard selfNode={selfNode as TailscalePeer} />
          </div>
        )}
        
        <div className="flex-1 w-full min-w-0">
          <PeerList 
            peers={peers} 
            deletingPeer={deletingPeer} 
            onDeleteClick={(id, name) => setDeviceToDelete({ id, name })} 
          />
        </div>
      </div>

      {/* Delete Confirmation Modal */}
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
