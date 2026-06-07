import React, { useEffect, useState } from 'react';
import { containerApi } from '../utils/api';

interface LogsModalProps {
  containerId: string;
  containerName: string;
  onClose: () => void;
}

export const LogsModal: React.FC<LogsModalProps> = ({ containerId, containerName, onClose }) => {
  const [logs, setLogs] = useState<string>('Loading logs...');

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await containerApi.getContainerLogs(containerId);
        setLogs(res.data.logs || 'No logs available.');
      } catch (err) {
        setLogs('Failed to fetch logs.');
      }
    };
    fetchLogs();
  }, [containerId]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-5xl flex flex-col h-[80vh] border border-gray-700">
        <div className="flex justify-between items-center p-4 border-b border-gray-700">
          <h3 className="text-xl font-semibold text-white">Logs: {containerName}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4 flex-1 overflow-auto bg-black m-4 rounded font-mono text-sm text-green-400 whitespace-pre-wrap">
          {logs}
        </div>
      </div>
    </div>
  );
};
