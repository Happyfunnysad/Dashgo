import React, { useState } from 'react';

interface TailscaleLoginCardProps {
  authURL?: string;
  onAuth: (key: string) => Promise<boolean>;
  loading: boolean;
}

export const TailscaleLoginCard: React.FC<TailscaleLoginCardProps> = ({ authURL, onAuth, loading }) => {
  const [authKey, setAuthKey] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authKey.trim()) return;
    const success = await onAuth(authKey);
    if (success) setAuthKey('');
  };

  return (
    <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 shadow-sm max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 bg-gray-900 rounded-xl flex items-center justify-center border border-gray-700">
          <span className="text-2xl">🛡️</span>
        </div>
        <div>
          <h3 className="text-white font-bold text-xl">Connect this server to Tailscale</h3>
          <p className="text-gray-400 text-sm mt-1">Enter a reusable or ephemeral auth key to add this host to your Tailnet.</p>
        </div>
      </div>
      
      <form onSubmit={handleSubmit} className="mb-6">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Auth key
        </label>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="password"
            value={authKey}
            onChange={(e) => setAuthKey(e.target.value)}
            placeholder="tskey-auth-..."
            className="flex-1 px-4 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono text-sm"
          />
          <button 
            type="submit"
            disabled={loading || !authKey.trim()}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white rounded-lg transition font-medium flex items-center justify-center min-w-[140px]"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              'Connect device'
            )}
          </button>
        </div>
      </form>

      {authURL && (
        <div className="pt-6 border-t border-gray-700/50">
          <p className="text-sm text-gray-400 mb-2">Alternatively, authorize this device in your browser:</p>
          <a 
            href={authURL} 
            target="_blank" 
            rel="noreferrer" 
            className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 font-medium transition"
          >
            Open authorization page
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      )}
    </div>
  );
};
