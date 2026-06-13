import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { containerApi, Settings } from '../utils/api';
import { authApi } from '../utils/api';
import { authStorage } from '../utils/authStorage';
import { TailscaleDevicePickerModal } from '../components/tailscale/TailscaleDevicePickerModal';

type SettingsSection = 'general' | 'network' | 'tailscale' | 'notifications' | 'security' | 'advanced';

const sections: { id: SettingsSection; label: string; icon: JSX.Element }[] = [
  { id: 'general', label: 'General', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><circle cx="12" cy="12" r="3" /></svg> },
  { id: 'network', label: 'Network & Links', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" /></svg> },
  { id: 'tailscale', label: 'Tailscale', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg> },
  { id: 'notifications', label: 'Notifications', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg> },
  { id: 'security', label: 'Security', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg> },
  { id: 'advanced', label: 'Advanced', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" /></svg> },
];

// --- Field Component ---
const Field: React.FC<{
  label: string;
  description?: string;
  children: React.ReactNode;
  error?: string;
}> = ({ label, description, children, error }) => (
  <div className="space-y-1.5">
    <label className="block text-sm font-medium text-slate-300">{label}</label>
    {description && <p className="text-xs text-slate-500">{description}</p>}
    {children}
    {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
  </div>
);

const InputField: React.FC<{
  label: string;
  name: string;
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
  description?: string;
  mono?: boolean;
  disabled?: boolean;
  error?: string;
  min?: number;
  max?: number;
  action?: { label: string; onClick: () => void; loading?: boolean };
}> = ({ label, name, value, onChange, placeholder, type = 'text', description, mono, disabled, error, min, max, action }) => (
  <Field label={label} description={description} error={error}>
    <div className="relative">
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        min={min}
        max={max}
        className={`w-full px-4 py-2.5 bg-slate-900/50 text-slate-100 rounded-lg border ${error ? 'border-red-500/50' : 'border-slate-700'} focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 outline-none transition-all disabled:opacity-50 ${mono ? 'font-mono text-sm' : ''} ${action ? 'pr-28' : ''}`}
      />
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          disabled={action.loading || disabled}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 rounded border border-slate-700 transition-colors disabled:opacity-50"
        >
          {action.loading ? 'Detecting...' : action.label}
        </button>
      )}
    </div>
  </Field>
);

// --- Section Card ---
const SectionCard: React.FC<{ id: string; title: string; description?: string; children: React.ReactNode }> = ({ id, title, description, children }) => (
  <div id={`section-${id}`} className="bg-slate-800/60 rounded-xl border border-slate-700/40 p-6 scroll-mt-20">
    <h3 className="text-lg font-bold text-slate-100 mb-1">{title}</h3>
    {description && <p className="text-sm text-slate-400 mb-5">{description}</p>}
    <div className="space-y-5">{children}</div>
  </div>
);

interface SettingsPageProps {}

export const SettingsPage: React.FC<SettingsPageProps> = () => {
  const { t, i18n } = useTranslation();
  const [settings, setSettings] = useState<Settings>({
    localNetworkIp: '',
    tailscaleIp: '',
    tailscaleHostname: '',
    domain: '',
    defaultProtocol: 'http',
    autoRefreshInterval: 10,
    webhookUrl: '',
  });
  const [originalSettings, setOriginalSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeSection, setActiveSection] = useState<SettingsSection>('general');
  const [webhookTesting, setWebhookTesting] = useState(false);
  const [webhookTestResult, setWebhookTestResult] = useState<string | null>(null);

  // Security state
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [authConfigured, setAuthConfigured] = useState(false);
  
  const [detectingLocal, setDetectingLocal] = useState(false);
  const [showDevicePicker, setShowDevicePicker] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [settingsRes, authRes] = await Promise.all([
          containerApi.getSettings(),
          authApi.getStatus(),
        ]);
        setSettings(settingsRes.data);
        setOriginalSettings(settingsRes.data);
        setAuthConfigured(authRes.data.configured);
      } catch (error) {
        console.error('Error fetching settings:', error);
      }
    };
    fetchAll();
  }, []);

  const hasUnsavedChanges = originalSettings && JSON.stringify(settings) !== JSON.stringify(originalSettings);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: name === 'autoRefreshInterval' ? parseInt(value, 10) || 0 : value,
    }));
  };

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const res = await containerApi.updateSettings(settings);
      setOriginalSettings(res.data);
      setSettings(res.data);
      setMessage({ type: 'success', text: 'Settings saved successfully' });
      setTimeout(() => setMessage(null), 3000);
    } catch {
      setMessage({ type: 'error', text: 'Failed to save settings' });
      setTimeout(() => setMessage(null), 3000);
    } finally {
      setLoading(false);
    }
  };

  const handleTestWebhook = async () => {
    if (!settings.webhookUrl) return;
    setWebhookTesting(true);
    setWebhookTestResult(null);
    try {
      const res = await fetch(settings.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '🧪 Dashgo webhook test', event: 'test', timestamp: new Date().toISOString() }),
      });
      setWebhookTestResult(res.ok ? 'success' : `Failed: HTTP ${res.status}`);
    } catch (err) {
      setWebhookTestResult('Failed: Network error');
    } finally {
      setWebhookTesting(false);
    }
  };

  const handleAutoDetectLocal = () => {
    setDetectingLocal(true);
    setTimeout(() => {
      const host = window.location.hostname;
      if (host !== 'localhost' && host !== '127.0.0.1' && !host.startsWith('100.')) {
        setSettings(prev => ({ ...prev, localNetworkIp: host }));
        setMessage({ type: 'success', text: 'Local IP detected from current connection' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: 'Could not auto-detect local IP from current URL. Please enter manually.' });
        setTimeout(() => setMessage(null), 3000);
      }
      setDetectingLocal(false);
    }, 400);
  };

  const handleAutoDetectTailscaleIp = () => {
    setShowDevicePicker(true);
  };

  const handleAutoDetectTailscaleHost = () => {
    setShowDevicePicker(true);
  };

  const handleChangePassword = async () => {
    setPasswordError('');
    setPasswordSuccess('');

    if (newPassword.length < 4) {
      setPasswordError('Password must be at least 4 characters');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    setPasswordLoading(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setPasswordSuccess('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setShowPasswordForm(false);
    } catch (err: any) {
      setPasswordError(err.response?.data?.error || 'Failed to change password');
    } finally {
      setPasswordLoading(false);
    }
  };

  const scrollToSection = (id: SettingsSection) => {
    setActiveSection(id);
    document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-slate-900">
      {/* Left Navigation */}
      <div className="w-56 shrink-0 border-r border-slate-800 p-4 flex flex-col">
        <h2 className="text-xl font-bold text-slate-100 px-3 mb-6">Settings</h2>
        <nav className="space-y-0.5">
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => scrollToSection(s.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeSection === s.id
                  ? 'bg-slate-800 text-slate-100 border border-slate-700/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <span className={activeSection === s.id ? 'text-blue-400' : ''}>{s.icon}</span>
              {s.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Main Content */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-8 pb-24">
        <div className="max-w-2xl space-y-6">

          {/* General */}
          <SectionCard id="general" title="General" description="Basic dashboard configuration">
            <InputField
              label="Dashboard Name"
              name="dashboardName"
              value=""
              onChange={() => {}}
              placeholder="My Home Server"
              description="Displayed in the sidebar header. Leave empty for hostname."
              disabled
            />
            <InputField
              label="Auto Refresh Interval"
              name="autoRefreshInterval"
              value={settings.autoRefreshInterval}
              onChange={handleChange}
              type="number"
              min={5}
              max={300}
              description="How often to poll container status (seconds)"
            />
            <Field label="Default Protocol">
              <select
                name="defaultProtocol"
                value={settings.defaultProtocol}
                onChange={handleChange}
                className="w-full px-4 py-2.5 bg-slate-900/50 text-slate-100 rounded-lg border border-slate-700 focus:border-blue-500 outline-none transition-all"
              >
                <option value="http">HTTP</option>
                <option value="https">HTTPS</option>
              </select>
            </Field>
            <Field label={t('app.language')}>
              <select
                value={i18n.language}
                onChange={e => handleLanguageChange(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-900/50 text-slate-100 rounded-lg border border-slate-700 focus:border-blue-500 outline-none transition-all"
              >
                <option value="en">English</option>
                <option value="ru">Русский</option>
                <option value="zh">中文</option>
              </select>
            </Field>
          </SectionCard>

          {/* Network */}
          <SectionCard id="network" title="Network & Links" description="How container access links are generated">
            <InputField
              label="Local Network IP"
              name="localNetworkIp"
              value={settings.localNetworkIp}
              onChange={handleChange}
              placeholder="e.g., 192.168.1.20"
              description="Used for LAN access links."
              mono
              action={{
                label: 'Auto-detect',
                onClick: handleAutoDetectLocal,
                loading: detectingLocal
              }}
            />
            <InputField
              label="Domain Name"
              name="domain"
              value={settings.domain}
              onChange={handleChange}
              placeholder="e.g., server.example.com"
              description="Used for domain-based access links (optional)"
              mono
            />
          </SectionCard>

          {/* Tailscale */}
          <SectionCard id="tailscale" title="Tailscale" description="VPN integration configuration">
            <div className="flex items-center gap-3 px-4 py-3 bg-slate-900/40 rounded-lg border border-slate-700/50">
              <div className="w-2.5 h-2.5 rounded-full bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.4)]" />
              <div>
                <p className="text-sm font-medium text-slate-200">Integration Active</p>
                <p className="text-xs text-slate-500">Tailscale daemon detected on host</p>
              </div>
              <span className="ml-auto px-2 py-0.5 bg-green-500/10 text-green-400 text-[10px] font-bold uppercase rounded border border-green-500/20">Configured</span>
            </div>

            <InputField
              label="Tailscale IP"
              name="tailscaleIp"
              value={settings.tailscaleIp}
              onChange={handleChange}
              placeholder="e.g., 100.90.80.70"
              description="Used for Tailnet access links."
              mono
              action={{
                label: 'Select Device',
                onClick: handleAutoDetectTailscaleIp
              }}
            />
            <InputField
              label="MagicDNS Hostname"
              name="tailscaleHostname"
              value={settings.tailscaleHostname}
              onChange={handleChange}
              placeholder="e.g., dashgo.tailnet-name.ts.net"
              description="Alternative to IP for Tailnet links."
              mono
              action={{
                label: 'Select Device',
                onClick: handleAutoDetectTailscaleHost
              }}
            />
          </SectionCard>

          {/* Notifications */}
          <SectionCard id="notifications" title="Notifications" description="Get alerted when something goes wrong">
            <div>
              <InputField
                label="Webhook URL"
                name="webhookUrl"
                value={settings.webhookUrl || ''}
                onChange={handleChange}
                placeholder="https://hooks.slack.com/... or Discord webhook"
                description="Receives POST when containers stop or become unhealthy"
                mono
              />
              {settings.webhookUrl && (
                <div className="mt-3 flex items-center gap-3">
                  <button
                    onClick={handleTestWebhook}
                    disabled={webhookTesting}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 text-sm font-medium rounded-lg transition-colors"
                  >
                    {webhookTesting ? (
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" /><path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" className="opacity-75" /></svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
                    )}
                    Send Test
                  </button>
                  {webhookTestResult && (
                    <span className={`text-xs font-medium ${webhookTestResult === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                      {webhookTestResult === 'success' ? '✓ Delivered' : webhookTestResult}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="pt-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Events</p>
              <div className="grid grid-cols-2 gap-2">
                {['Container Unhealthy', 'Container Stopped', 'Container Restarted', 'Update Available', 'High Temperature', 'Low Disk Space'].map(event => (
                  <label key={event} className="flex items-center gap-2 px-3 py-2 bg-slate-900/40 rounded-lg border border-slate-700/50 cursor-pointer hover:border-slate-600 transition-colors">
                    <input type="checkbox" defaultChecked className="rounded bg-slate-700 border-slate-600 text-blue-500 focus:ring-blue-500/30" />
                    <span className="text-xs text-slate-300">{event}</span>
                  </label>
                ))}
              </div>
              <p className="text-[10px] text-slate-600 mt-2 italic">Event filtering coming in a future update</p>
            </div>
          </SectionCard>

          {/* Security */}
          <SectionCard id="security" title="Security" description="Authentication and access control">
            <div className="flex items-center justify-between px-4 py-3 bg-slate-900/40 rounded-lg border border-slate-700/50">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
                <div>
                  <p className="text-sm font-medium text-slate-200">Password Authentication</p>
                  <p className="text-xs text-slate-500">Single admin password protects all endpoints</p>
                </div>
              </div>
              <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded border ${authConfigured ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                {authConfigured ? 'Enabled' : 'Not Set'}
              </span>
            </div>

            {authConfigured && (
              <div>
                {!showPasswordForm ? (
                  <button
                    onClick={() => setShowPasswordForm(true)}
                    className="text-sm text-blue-400 hover:text-blue-300 font-medium transition-colors"
                  >
                    Change Password →
                  </button>
                ) : (
                  <div className="space-y-3 p-4 bg-slate-900/40 rounded-lg border border-slate-700/50">
                    <InputField
                      label="Current Password"
                      name="currentPassword"
                      value={currentPassword}
                      onChange={e => setCurrentPassword(e.target.value)}
                      type="password"
                    />
                    <InputField
                      label="New Password"
                      name="newPassword"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      type="password"
                      error={passwordError}
                    />
                    <InputField
                      label="Confirm New Password"
                      name="confirmNewPassword"
                      value={confirmNewPassword}
                      onChange={e => setConfirmNewPassword(e.target.value)}
                      type="password"
                    />
                    {passwordSuccess && <p className="text-xs text-green-400">{passwordSuccess}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={handleChangePassword}
                        disabled={passwordLoading}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        {passwordLoading ? 'Saving...' : 'Update Password'}
                      </button>
                      <button
                        onClick={() => { setShowPasswordForm(false); setPasswordError(''); setPasswordSuccess(''); }}
                        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <Field label="Session Timeout" description="How long login sessions last">
              <div className="px-4 py-2.5 bg-slate-900/50 text-slate-400 rounded-lg border border-slate-700 text-sm">
                24 hours (default)
              </div>
            </Field>
          </SectionCard>

          {/* Advanced */}
          <SectionCard id="advanced" title="Advanced" description="Low-level configuration for power users">
            <Field label="Docker Socket Path">
              <div className="px-4 py-2.5 bg-slate-900/50 text-slate-400 rounded-lg border border-slate-700 font-mono text-sm">
                /var/run/docker.sock
              </div>
            </Field>
            <Field label="Data Directory">
              <div className="px-4 py-2.5 bg-slate-900/50 text-slate-400 rounded-lg border border-slate-700 font-mono text-sm">
                /app/data
              </div>
            </Field>
            <Field label="Thermal Zone Path">
              <div className="px-4 py-2.5 bg-slate-900/50 text-slate-400 rounded-lg border border-slate-700 font-mono text-sm">
                /host/sys/class/thermal/
              </div>
            </Field>
            <div className="pt-3 border-t border-slate-700/40">
              <p className="text-xs text-slate-500 mb-3">Configuration is stored in <code className="text-slate-400 bg-slate-900/50 px-1.5 py-0.5 rounded">/app/data/config.json</code> and persists across container restarts.</p>
            </div>
          </SectionCard>
        </div>
      </div>

      {/* Sticky Save Bar */}
      {hasUnsavedChanges && (
        <div className="fixed bottom-0 right-0 left-56 ml-64 bg-slate-800/95 backdrop-blur-sm border-t border-slate-700/50 px-8 py-4 flex items-center justify-between z-50">
          <div className="flex items-center gap-2 text-sm text-amber-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
            You have unsaved changes
          </div>
          <div className="flex items-center gap-3">
            {message && (
              <span className={`text-sm font-medium ${message.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                {message.text}
              </span>
            )}
            <button
              onClick={() => { setSettings(originalSettings!); }}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium rounded-lg transition-colors"
            >
              Discard
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-colors"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {showDevicePicker && (
        <TailscaleDevicePickerModal
          onClose={() => setShowDevicePicker(false)}
          onSelect={(ip, hostname) => {
            setSettings(prev => ({ ...prev, tailscaleIp: ip, tailscaleHostname: hostname }));
            setShowDevicePicker(false);
            setMessage({ type: 'success', text: 'Tailscale device selected successfully' });
            setTimeout(() => setMessage(null), 3000);
          }}
        />
      )}
    </div>
  );
};
