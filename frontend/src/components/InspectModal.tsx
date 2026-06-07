import React, { useEffect, useState } from 'react';
import { containerApi, ContainerDetails } from '../utils/api';

interface InspectModalProps {
  containerId: string;
  containerName: string;
  onClose: () => void;
}

export const InspectModal: React.FC<InspectModalProps> = ({ containerId, containerName, onClose }) => {
  const [details, setDetails] = useState<ContainerDetails | null>(null);
  const [error, setError] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'env' | 'mounts' | 'networks'>('env');

  useEffect(() => {
    const fetchInspect = async () => {
      try {
        const res = await containerApi.getContainerInspect(containerId);
        setDetails(res.data);
      } catch (err) {
        setError('Failed to fetch inspect data.');
      }
    };
    fetchInspect();
  }, [containerId]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-4xl flex flex-col h-[70vh] border border-gray-700">
        <div className="flex justify-between items-center p-4 border-b border-gray-700">
          <h3 className="text-xl font-semibold text-white">Inspect: {containerName}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="flex border-b border-gray-700">
          <button 
            className={`px-4 py-3 text-sm font-medium ${activeTab === 'env' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-white'}`}
            onClick={() => setActiveTab('env')}
          >
            Environment Variables
          </button>
          <button 
            className={`px-4 py-3 text-sm font-medium ${activeTab === 'mounts' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-white'}`}
            onClick={() => setActiveTab('mounts')}
          >
            Mounts / Volumes
          </button>
          <button 
            className={`px-4 py-3 text-sm font-medium ${activeTab === 'networks' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-white'}`}
            onClick={() => setActiveTab('networks')}
          >
            Networks
          </button>
        </div>

        <div className="p-4 flex-1 overflow-auto">
          {error ? (
            <div className="text-red-400">{error}</div>
          ) : !details ? (
            <div className="text-gray-400">Loading inspect data...</div>
          ) : (
            <div>
              {activeTab === 'env' && (
                <div className="space-y-2">
                  {details.env.length === 0 ? <p className="text-gray-400">No environment variables.</p> : null}
                  {details.env.map((e, i) => {
                    const [key, ...rest] = e.split('=');
                    const val = rest.join('=');
                    return (
                      <div key={i} className="flex bg-gray-900 rounded p-2 border border-gray-700">
                        <span className="text-blue-300 font-mono w-1/3 truncate" title={key}>{key}</span>
                        <span className="text-gray-300 font-mono w-2/3 break-all">{val}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              
              {activeTab === 'mounts' && (
                <div className="space-y-4">
                  {details.mounts.length === 0 ? <p className="text-gray-400">No mounts attached.</p> : null}
                  {details.mounts.map((m, i) => (
                    <div key={i} className="bg-gray-900 rounded p-4 border border-gray-700 text-sm">
                      <div className="grid grid-cols-6 gap-2 mb-2">
                        <span className="col-span-1 text-gray-500">Type</span>
                        <span className="col-span-5 text-gray-200">{m.type}</span>
                      </div>
                      <div className="grid grid-cols-6 gap-2 mb-2">
                        <span className="col-span-1 text-gray-500">Source</span>
                        <span className="col-span-5 text-blue-300 font-mono break-all">{m.source}</span>
                      </div>
                      <div className="grid grid-cols-6 gap-2 mb-2">
                        <span className="col-span-1 text-gray-500">Dest</span>
                        <span className="col-span-5 text-green-300 font-mono break-all">{m.destination}</span>
                      </div>
                      <div className="grid grid-cols-6 gap-2">
                        <span className="col-span-1 text-gray-500">Mode</span>
                        <span className="col-span-5 text-gray-200">{m.mode} ({m.rw ? 'Read/Write' : 'Read-Only'})</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'networks' && (
                <div className="flex gap-2 flex-wrap">
                  {details.networks.length === 0 ? <p className="text-gray-400">No networks attached.</p> : null}
                  {details.networks.map((n, i) => (
                    <div key={i} className="bg-gray-900 text-gray-200 px-4 py-2 rounded-full border border-gray-700">
                      {n}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
