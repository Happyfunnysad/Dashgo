import React from 'react';

interface TailscaleErrorStateProps {
  error: string;
  onRetry: () => void;
}

export const TailscaleErrorState: React.FC<TailscaleErrorStateProps> = ({ error, onRetry }) => {
  return (
    <div className="bg-gray-800 rounded-xl p-8 border border-red-900/50 flex flex-col items-center justify-center text-center">
      <div className="w-16 h-16 bg-red-900/20 rounded-full flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h3 className="text-white font-semibold text-xl mb-2">Tailscale is unavailable</h3>
      <p className="text-gray-400 max-w-md mb-6">{error}</p>
      
      <button 
        onClick={onRetry}
        className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition font-medium"
      >
        Try again
      </button>
    </div>
  );
};
