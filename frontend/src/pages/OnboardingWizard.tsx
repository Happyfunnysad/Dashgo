import React, { useState, useEffect } from 'react';
import { authApi, containerApi, Settings } from '../utils/api';
import { authStorage } from '../utils/authStorage';
import { TailscaleDevicePickerModal } from '../components/tailscale/TailscaleDevicePickerModal';
import { TailscaleLoginCard } from '../components/tailscale/TailscaleLoginCard';

interface OnboardingWizardProps {
  onComplete: () => void;
}

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ onComplete }) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1: Password
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Step 2: Tailscale
  const [tsStatus, setTsStatus] = useState<any>(null);
  const [tsLoading, setTsLoading] = useState(true);

  // Step 3: Network
  const [localIp, setLocalIp] = useState('');
  const [tsIp, setTsIp] = useState('');
  const [tsHostname, setTsHostname] = useState('');
  const [showPicker, setShowPicker] = useState(false);

  // Load Tailscale status on Step 2
  useEffect(() => {
    if (step === 2) {
      let interval: any;
      const fetchTs = async () => {
        try {
          const res = await containerApi.getTailscaleStatus();
          setTsStatus(res.data);
        } catch (e) {
          console.error(e);
        } finally {
          setTsLoading(false);
        }
      };
      fetchTs();
      interval = setInterval(fetchTs, 3000);
      return () => clearInterval(interval);
    }
  }, [step]);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) return setError('Passwords do not match');
    if (password.length < 4) return setError('Password must be at least 4 characters');
    setLoading(true);
    try {
      const res = await authApi.setup(password);
      authStorage.setToken(res.data.token);
      setStep(2);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to set password');
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = async () => {
    setLoading(true);
    try {
      const settingsRes = await containerApi.getSettings();
      const current = settingsRes.data;
      const updated: Settings = {
        ...current,
        localNetworkIp: localIp || current.localNetworkIp,
        tailscaleIp: tsIp || current.tailscaleIp,
        tailscaleHostname: tsHostname || current.tailscaleHostname,
      };
      await containerApi.updateSettings(updated);
      onComplete();
    } catch (err) {
      setError('Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    if (step === 2) setStep(3);
    else if (step === 3) onComplete();
  };

  const handleAuth = async (key: string): Promise<boolean> => {
     // In the wizard, they primarily use the AuthURL.
     // If they enter a key, we can call the API or just return true.
     return true;
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-800 rounded-2xl border border-slate-700/50 mb-4">
            <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-2.25-1.313M21 7.5v2.25m0-2.25l-2.25 1.313M3 7.5l2.25-1.313M3 7.5l2.25 1.313M3 7.5v2.25m9 3l2.25-1.313M12 12.75l-2.25-1.313M12 12.75V15m0 6.75l2.25-1.313M12 21.75V19.5m0 2.25l-2.25-1.313m0-16.875L12 2.25l2.25 1.313M21 14.25v2.25l-2.25 1.313m-13.5 0L3 16.5v-2.25" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Welcome to Dashgo</h1>
          <div className="flex justify-center gap-2 mt-4">
             <div className={`h-1.5 w-8 rounded-full ${step >= 1 ? 'bg-blue-500' : 'bg-slate-700'}`} />
             <div className={`h-1.5 w-8 rounded-full ${step >= 2 ? 'bg-blue-500' : 'bg-slate-700'}`} />
             <div className={`h-1.5 w-8 rounded-full ${step >= 3 ? 'bg-blue-500' : 'bg-slate-700'}`} />
          </div>
        </div>

        <div className="bg-slate-800/60 rounded-xl p-6 border border-slate-700/40 shadow-lg">
          {step === 1 && (
            <form onSubmit={handleSetPassword} className="space-y-4">
              <h2 className="text-lg font-bold text-slate-100 mb-2">1. Set Admin Password</h2>
              <p className="text-sm text-slate-400 mb-4">Protect your dashboard from unauthorized access.</p>
              
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoFocus className="w-full px-4 py-3 bg-slate-900/50 text-slate-100 rounded-lg border border-slate-700 focus:border-blue-500 outline-none" placeholder="••••••••" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Confirm Password</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required className="w-full px-4 py-3 bg-slate-900/50 text-slate-100 rounded-lg border border-slate-700 focus:border-blue-500 outline-none" placeholder="••••••••" />
              </div>
              {error && <div className="text-red-400 text-sm">{error}</div>}
              <button type="submit" disabled={loading} className="w-full py-3 mt-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors">
                {loading ? 'Setting up...' : 'Save Password'}
              </button>
            </form>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-slate-100 mb-2">2. Connect Tailscale</h2>
              <p className="text-sm text-slate-400 mb-4">Connect Dashgo to your Tailnet to access your services securely from anywhere.</p>
              
              {tsLoading ? (
                <div className="py-8 text-center text-slate-400">Loading Tailscale status...</div>
              ) : tsStatus?.BackendState === 'NeedsLogin' ? (
                <TailscaleLoginCard authURL={tsStatus.AuthURL} onAuth={handleAuth} loading={false} />
              ) : (
                <div className="py-6 px-4 bg-green-500/10 border border-green-500/20 rounded-lg text-center">
                  <div className="w-12 h-12 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <h3 className="text-green-400 font-bold mb-1">Tailscale is Connected!</h3>
                  <p className="text-green-400/80 text-sm">Your dashboard is secured on your Tailnet.</p>
                </div>
              )}
              
              <div className="flex gap-3 pt-4">
                <button onClick={handleSkip} className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold rounded-lg transition-colors">
                  {tsStatus?.BackendState === 'NeedsLogin' ? 'Configure Later' : 'Skip'}
                </button>
                {tsStatus?.BackendState !== 'NeedsLogin' && (
                  <button onClick={() => setStep(3)} className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors">
                    Continue
                  </button>
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-slate-100 mb-2">3. Network Settings</h2>
              <p className="text-sm text-slate-400 mb-4">Set up the base IPs used for generating links to your containers.</p>
              
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Local Network IP</label>
                <div className="relative">
                  <input type="text" value={localIp} onChange={e => setLocalIp(e.target.value)} placeholder="e.g. 192.168.1.10" className="w-full px-4 py-3 bg-slate-900/50 text-slate-100 font-mono rounded-lg border border-slate-700 pr-24" />
                  <button onClick={() => setLocalIp(window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' ? window.location.hostname : '')} className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-slate-800 text-xs text-slate-300 rounded hover:bg-slate-700 border border-slate-700">Auto</button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Tailscale Target Device</label>
                <div className="relative">
                  <input type="text" value={tsIp} readOnly placeholder="e.g. 100.x.x.x" className="w-full px-4 py-3 bg-slate-900/50 text-slate-400 font-mono rounded-lg border border-slate-700 pr-32 cursor-not-allowed" />
                  <button onClick={() => setShowPicker(true)} className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-xs text-white rounded font-medium">Select Device</button>
                </div>
                {tsHostname && <p className="text-xs text-slate-500 mt-1">Hostname: {tsHostname}</p>}
              </div>

              {error && <div className="text-red-400 text-sm">{error}</div>}

              <div className="flex gap-3 pt-4">
                <button onClick={handleSkip} disabled={loading} className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold rounded-lg transition-colors">
                  Configure Later
                </button>
                <button onClick={handleFinish} disabled={loading} className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors">
                  {loading ? 'Saving...' : 'Finish Setup'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {showPicker && (
        <TailscaleDevicePickerModal
          onClose={() => setShowPicker(false)}
          onSelect={(ip, hostname) => {
            setTsIp(ip);
            setTsHostname(hostname);
            setShowPicker(false);
          }}
        />
      )}
    </div>
  );
};
