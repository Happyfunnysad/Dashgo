import React from 'react';
import { getHealthColor, getHealthLabel } from '../utils/formatters';

interface HealthBadgeProps {
  health: 'healthy' | 'unhealthy' | 'starting' | 'none';
  showLabel?: boolean;
}

export const HealthBadge: React.FC<HealthBadgeProps> = ({ health, showLabel = true }) => {
  const colorClass = getHealthColor(health);
  const label = getHealthLabel(health);

  return (
    <div className={`inline-flex items-center ${colorClass} border text-xs font-semibold px-3 py-1 rounded-full gap-1.5 shadow-sm`}>
      {health === 'healthy' && <span className="font-bold">✓</span>}
      {health === 'unhealthy' && <span className="font-bold">✗</span>}
      {health === 'starting' && <span className="font-bold">⟳</span>}
      {health === 'none' && <span className="font-bold">○</span>}
      {showLabel && <span>{label}</span>}
    </div>
  );
};
