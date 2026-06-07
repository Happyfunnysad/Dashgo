import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { DashboardPage } from './pages/Dashboard';
import { SettingsPage } from './pages/Settings';
import { TailscalePage } from './pages/TailscalePage';
import { LoginPage } from './pages/LoginPage';
import { authApi } from './utils/api';
import { authStorage } from './utils/authStorage';
import './index.css';

type AuthState = 'loading' | 'setup' | 'login' | 'authenticated';

function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'settings' | 'tailscale'>('dashboard');
  const [authState, setAuthState] = useState<AuthState>('loading');

  const checkAuth = async () => {
    try {
      const res = await authApi.getStatus();
      const configured = res.data.configured;

      if (!configured) {
        // No password set — show setup screen
        setAuthState('setup');
        return;
      }

      // Password is configured — check if we have a valid token
      if (authStorage.isAuthenticated()) {
        // Verify token is still valid by making a test request
        try {
          await authApi.getStatus(); // This one passes through middleware
          setAuthState('authenticated');
        } catch {
          authStorage.clearToken();
          setAuthState('login');
        }
      } else {
        setAuthState('login');
      }
    } catch {
      // Backend not reachable — assume no auth
      setAuthState('authenticated');
    }
  };

  useEffect(() => {
    checkAuth();

    // Listen for 401 events from axios interceptor
    const handleUnauthorized = () => {
      setAuthState('login');
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  const handleAuthenticated = () => {
    setAuthState('authenticated');
  };

  const handleLogout = () => {
    authApi.logout().catch(() => {});
    authStorage.clearToken();
    setAuthState('login');
  };

  // Loading state
  if (authState === 'loading') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <svg className="w-6 h-6 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
            <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" className="opacity-75" />
          </svg>
          <span className="text-sm font-medium">Connecting...</span>
        </div>
      </div>
    );
  }

  // Setup or Login
  if (authState === 'setup' || authState === 'login') {
    return (
      <LoginPage
        isSetup={authState === 'setup'}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  // Authenticated — show main app
  return (
    <div className="flex h-screen bg-gray-900">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} onLogout={handleLogout} />
      {activeTab === 'dashboard' && <DashboardPage />}
      {activeTab === 'settings' && <SettingsPage />}
      {activeTab === 'tailscale' && <TailscalePage />}
    </div>
  );
}

export default App;
