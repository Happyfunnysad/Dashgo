import React from 'react';
import { IconDashboard, IconSettings, IconNetwork } from './icons/Icons';

interface SidebarProps {
  activeTab: 'dashboard' | 'settings' | 'tailscale';
  onTabChange: (tab: 'dashboard' | 'settings' | 'tailscale') => void;
  onLogout?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange, onLogout }) => {
  return (
    <div className="hidden w-64 shrink-0 flex-col border-r border-slate-700 bg-slate-900 p-6 md:flex">
      <div className="flex items-center gap-3 mb-8 px-2">
        <div className="w-10 h-10 bg-slate-800 border border-slate-700 rounded-xl flex items-center justify-center shadow-inner">
          <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </div>
        <h1 className="text-xl font-bold tracking-tight text-slate-100">Dashgo</h1>
      </div>

      <nav className="space-y-1">
        <button
          onClick={() => onTabChange('dashboard')}
          className={`w-full text-left px-4 py-3 rounded-lg font-medium transition-all duration-200 flex items-center gap-3 ${
            activeTab === 'dashboard'
              ? 'bg-slate-800 text-slate-100 shadow-sm border border-slate-700/50'
              : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
          }`}
        >
          <IconDashboard className={`w-5 h-5 ${activeTab === 'dashboard' ? 'text-green-400' : ''}`} />
          Dashboard
        </button>
        <button
          onClick={() => onTabChange('tailscale')}
          className={`w-full text-left px-4 py-3 rounded-lg font-medium transition-all duration-200 flex items-center gap-3 ${
            activeTab === 'tailscale'
              ? 'bg-slate-800 text-slate-100 shadow-sm border border-slate-700/50'
              : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
          }`}
        >
          <IconNetwork className={`w-5 h-5 ${activeTab === 'tailscale' ? 'text-green-400' : ''}`} />
          Tailnet
        </button>
        <button
          onClick={() => onTabChange('settings')}
          className={`w-full text-left px-4 py-3 rounded-lg font-medium transition-all duration-200 flex items-center gap-3 ${
            activeTab === 'settings'
              ? 'bg-slate-800 text-slate-100 shadow-sm border border-slate-700/50'
              : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
          }`}
        >
          <IconSettings className={`w-5 h-5 ${activeTab === 'settings' ? 'text-green-400' : ''}`} />
          Settings
        </button>
      </nav>

      <div className="mt-auto pt-6 border-t border-slate-800 px-2 space-y-4">
        <div className="text-xs space-y-1">
          <p className="text-slate-500 font-medium uppercase tracking-wider">Docker Socket</p>
          <p className="font-mono text-slate-400 truncate bg-slate-800/50 px-2 py-1 rounded border border-slate-800 mt-2">/var/run/docker.sock</p>
        </div>
        {onLogout && (
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
            </svg>
            Sign Out
          </button>
        )}
      </div>
    </div>
  );
};
