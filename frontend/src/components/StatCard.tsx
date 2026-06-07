import React from 'react';

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  colorClass: string;
}

export const StatCard: React.FC<StatCardProps> = ({ title, value, icon, colorClass }) => {
  return (
    <div className="bg-slate-800 rounded-xl p-6 border border-slate-700/50 hover:bg-slate-700/50 hover:border-slate-600 transition-colors duration-300 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-400 text-sm font-medium tracking-wide uppercase">{title}</p>
          <p className="text-4xl font-bold text-slate-50 mt-3">{value}</p>
        </div>
        <div className={`p-3 rounded-xl ${colorClass}`}>
          {icon}
        </div>
      </div>
    </div>
  );
};
