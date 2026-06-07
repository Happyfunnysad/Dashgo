import React, { useEffect, useState } from 'react';
import { containerApi, ContainerMetrics } from '../utils/api';

interface StatsModalProps {
  containerId: string;
  containerName: string;
  onClose: () => void;
}

export const StatsModal: React.FC<StatsModalProps> = ({ containerId, containerName, onClose }) => {
  const [stats, setStats] = useState<ContainerMetrics | null>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await containerApi.getContainerStats(containerId);
        setStats(res.data);
      } catch (err) {
        setError('Failed to fetch stats.');
      }
    };
    
    fetchStats();
    const interval = setInterval(fetchStats, 3000);
    return () => clearInterval(interval);
  }, [containerId]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-md flex flex-col border border-gray-700">
        <div className="flex justify-between items-center p-4 border-b border-gray-700">
          <h3 className="text-xl font-semibold text-white">Stats: {containerName}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6">
          {error ? (
            <div className="text-red-400">{error}</div>
          ) : !stats ? (
            <div className="text-gray-400">Loading stats...</div>
          ) : (
            <div className="space-y-6">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium text-white">CPU Usage</span>
                  <span className="text-sm font-medium text-white">{stats.cpuPercentage.toFixed(2)}%</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2.5">
                  <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${Math.min(stats.cpuPercentage, 100)}%` }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium text-white">Memory Usage</span>
                  <span className="text-sm font-medium text-white">
                    {formatBytes(stats.memoryUsageBytes)} / {formatBytes(stats.memoryLimitBytes)} ({stats.memoryPercentage.toFixed(2)}%)
                  </span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2.5">
                  <div className="bg-green-500 h-2.5 rounded-full" style={{ width: `${Math.min(stats.memoryPercentage, 100)}%` }}></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
