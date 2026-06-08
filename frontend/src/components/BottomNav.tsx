import React from 'react';
import { IconDashboard, IconSettings, IconNetwork } from './icons/Icons';

interface BottomNavProps {
  activeTab: 'dashboard' | 'settings' | 'tailscale';
  onTabChange: (tab: 'dashboard' | 'settings' | 'tailscale') => void;
  onLogout?: () => void;
}

const itemClass = (active: boolean) =>
  `flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-2 py-2 text-[10px] font-medium transition-colors ${
    active ? 'text-green-400' : 'text-slate-500 hover:text-slate-300'
  }`;

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onTabChange, onLogout }) => (
  <nav className="fixed inset-x-0 bottom-0 z-50 flex h-16 items-stretch border-t border-slate-700/70 bg-slate-900/95 px-2 backdrop-blur md:hidden">
    <button type="button" onClick={() => onTabChange('dashboard')} className={itemClass(activeTab === 'dashboard')}>
      <IconDashboard className="h-5 w-5" />
      <span className="truncate">Dashboard</span>
    </button>
    <button type="button" onClick={() => onTabChange('tailscale')} className={itemClass(activeTab === 'tailscale')}>
      <IconNetwork className="h-5 w-5" />
      <span className="truncate">Tailnet</span>
    </button>
    <button type="button" onClick={() => onTabChange('settings')} className={itemClass(activeTab === 'settings')}>
      <IconSettings className="h-5 w-5" />
      <span className="truncate">Settings</span>
    </button>
    {onLogout && (
      <button type="button" onClick={onLogout} className={itemClass(false)}>
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
        </svg>
        <span className="truncate">Sign out</span>
      </button>
    )}
  </nav>
);
