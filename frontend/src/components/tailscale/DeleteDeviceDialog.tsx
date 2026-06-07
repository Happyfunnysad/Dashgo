import React, { useEffect, useRef, useState } from 'react';
import { session } from '../../utils/session';

interface DeleteDeviceDialogProps {
  deviceName: string;
  onConfirm: (apiKey: string) => void;
  onCancel: () => void;
  isDeleting: boolean;
}

export const DeleteDeviceDialog: React.FC<DeleteDeviceDialogProps> = ({ 
  deviceName, 
  onConfirm, 
  onCancel, 
  isDeleting 
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  
  // Check if session is already unlocked
  const [hasSessionKey, setHasSessionKey] = useState<boolean>(!!session.getTailscaleApiKey());
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [error, setError] = useState('');

  // Focus trap & Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) {
        onCancel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    
    // Auto-focus the cancel button on mount for safety
    const cancelButton = modalRef.current?.querySelector('button[data-cancel]') as HTMLButtonElement;
    if (cancelButton) {
      cancelButton.focus();
    }

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, isDeleting]);

  const handleConfirm = () => {
    let keyToUse = session.getTailscaleApiKey();
    if (!keyToUse) {
      if (!apiKeyInput.trim().startsWith('tskey-api-')) {
        setError('API Key must start with "tskey-api-"');
        return;
      }
      try {
        session.saveTailscaleApiKey(apiKeyInput.trim());
        keyToUse = apiKeyInput.trim();
        setHasSessionKey(true);
      } catch (err: any) {
        setError(err.message || 'Invalid API key');
        return;
      }
    }
    
    if (keyToUse) {
      onConfirm(keyToUse);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div 
        ref={modalRef}
        className="bg-gray-800 rounded-xl max-w-md w-full p-6 border border-gray-700 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-900/20 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 id="modal-title" className="text-xl font-bold text-white">Remove device?</h3>
        </div>

        <p className="text-gray-400 mb-6 leading-relaxed">
          <span className="text-white font-semibold">"{deviceName}"</span> will be removed from your Tailnet. 
          You may need to authenticate it again to reconnect.
        </p>

        {!hasSessionKey && (
          <div className="mb-6 p-4 bg-gray-900/50 rounded-lg border border-gray-700/50">
            <h4 className="text-sm font-medium text-white mb-2">Unlock Management</h4>
            <p className="text-xs text-gray-400 mb-3">
              Please provide a Tailscale API Access Token (`tskey-api-...`) to manage devices. It will be temporarily saved for 15 minutes.
            </p>
            <input
              type="password"
              placeholder="tskey-api-..."
              value={apiKeyInput}
              onChange={(e) => {
                setApiKeyInput(e.target.value);
                setError('');
              }}
              className="w-full px-3 py-2 bg-gray-800 text-white border border-gray-600 rounded-md focus:outline-none focus:border-blue-500 font-mono text-sm"
            />
            {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row justify-end gap-3">
          <button 
            data-cancel
            onClick={onCancel}
            disabled={isDeleting}
            className="px-5 py-2.5 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition font-medium focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            Cancel
          </button>
          <button 
            onClick={handleConfirm}
            disabled={isDeleting || (!hasSessionKey && !apiKeyInput.trim())}
            className="px-5 py-2.5 bg-red-600 hover:bg-red-500 disabled:bg-red-800 disabled:text-red-300 disabled:cursor-not-allowed text-white rounded-lg transition font-medium focus:outline-none focus:ring-2 focus:ring-red-500 flex items-center justify-center min-w-[140px]"
          >
            {isDeleting ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              'Remove device'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
