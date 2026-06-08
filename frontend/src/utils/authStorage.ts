// SECURITY NOTE: The auth token is stored in localStorage.
// Risk: XSS attacks can read localStorage and steal the token.
// Mitigations in place:
//   - The app is a single embedded binary (same-origin), so there are no
//     cross-origin script injection vectors from CDNs or third-party scripts.
//   - Content-Security-Policy headers (if added) would further limit XSS surface.
// TODO: Migrate to httpOnly + SameSite=Strict cookie to eliminate this risk
//       entirely (requires adding a CSRF token to mutating API requests).
const TOKEN_KEY = 'dashgo_auth_token';

export const authStorage = {
  getToken: (): string | null => {
    return localStorage.getItem(TOKEN_KEY);
  },

  setToken: (token: string): void => {
    localStorage.setItem(TOKEN_KEY, token);
  },

  clearToken: (): void => {
    localStorage.removeItem(TOKEN_KEY);
  },

  isAuthenticated: (): boolean => {
    return !!localStorage.getItem(TOKEN_KEY);
  },
};
