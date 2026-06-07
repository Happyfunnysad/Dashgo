const TS_KEY_STORAGE = 'ts_api_session_key';
const TS_KEY_EXPIRY = 'ts_api_session_expiry';

// 15 minutes in milliseconds
const SESSION_DURATION_MS = 15 * 60 * 1000;

export const session = {
  saveTailscaleApiKey(key: string) {
    if (!key.startsWith('tskey-api-')) {
      throw new Error('Invalid API Key format. Must start with tskey-api-');
    }
    const expiry = Date.now() + SESSION_DURATION_MS;
    localStorage.setItem(TS_KEY_STORAGE, key);
    localStorage.setItem(TS_KEY_EXPIRY, expiry.toString());
  },

  getTailscaleApiKey(): string | null {
    const key = localStorage.getItem(TS_KEY_STORAGE);
    const expiryStr = localStorage.getItem(TS_KEY_EXPIRY);

    if (!key || !expiryStr) {
      return null;
    }

    const expiry = parseInt(expiryStr, 10);
    if (Date.now() > expiry) {
      // Session expired
      this.clearTailscaleApiKey();
      return null;
    }

    return key;
  },

  clearTailscaleApiKey() {
    localStorage.removeItem(TS_KEY_STORAGE);
    localStorage.removeItem(TS_KEY_EXPIRY);
  }
};
