import React from 'react';
import { getStatusColor } from '../utils/formatters';

interface StatusBadgeProps {
  status: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const colorClass = getStatusColor(status);
  const displayStatus = status.replace(/^Up /, '').replace(/^Exited /, 'Exited: ');

  return (
    <div className={`inline-flex items-center ${colorClass} border text-xs font-semibold px-3 py-1 rounded-full shadow-sm`}>
      <span>{displayStatus}</span>
    </div>
  );
};
