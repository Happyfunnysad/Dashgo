# Security Audit Report - Dashgo

**Project:** Dashgo - Lightweight Docker Dashboard
**Audit Date:** 2026-06-13
**Auditor:** Security Audit Agent
**Version:** Latest (commit from 2026-06-13)

---

## Executive Summary

Dashgo is a lightweight Docker dashboard for SBCs and home servers with a Go backend and React frontend. The application implements several security best practices but has some areas that warrant attention.

**Overall Assessment:** The codebase demonstrates good security awareness with strong authentication, SSRF protection, and proper Docker socket handling. However, several medium-severity issues should be addressed to harden the application against real-world attack scenarios.

**Risk Level:** LOW-MEDIUM

---

## Findings Summary

| ID | Severity | Category | Description | Location |
|----|----------|----------|-------------|----------|
| F1 | MEDIUM | Authentication | bcrypt cost uses default (10) instead of minimum recommended (12) | auth/auth.go:114 |
| F2 | MEDIUM | Frontend Security | Auth token stored in localStorage, vulnerable to XSS theft | authStorage.ts |
| F3 | MEDIUM | API Security | Missing rate limiting on sensitive endpoints beyond login | handlers.go |
| F4 | MEDIUM | Infrastructure | No HTTPS/TLS enforcement; no HSTS headers | main.go |
| F5 | LOW | API Security | Container IDs passed directly to Docker client without validation | handlers.go:211,222,232 |
| F6 | LOW | Infrastructure | No Content-Security-Policy headers | main.go |
| F7 | LOW | Frontend Security | Missing security response headers (X-Frame-Options, X-Content-Type-Options) | main.go |
| F8 | LOW | Authentication | Minimum password length of 8 characters is lower than OWASP recommendation | auth/auth.go:33 |

---

## Detailed Findings

### F1: bcrypt Cost Configuration

**Severity:** MEDIUM
**Location:** `backend-go/internal/auth/auth.go:114`

**Description:**
The password hashing uses `bcrypt.DefaultCost` which equals 10 in Go. While this provides reasonable security, OWASP recommends using cost 12 or higher for password hashing to ensure adequate protection against brute-force attacks on captured hashes.

**Current Code:**
```go
hash, err := bcrypt.GenerateFromPassword([]byte(plaintext), bcrypt.DefaultCost)
```

**Recommendation:**
Explicitly set bcrypt cost to 12:
```go
hash, err := bcrypt.GenerateFromPassword([]byte(plaintext), 12)
```

---

### F2: Auth Token Storage in localStorage

**Severity:** MEDIUM
**Location:** `frontend/src/utils/authStorage.ts`

**Description:**
The authentication token is stored in localStorage. This is vulnerable to XSS attacks where malicious scripts can read the token. The code acknowledges this risk in a comment but does not implement the recommended mitigation (httpOnly cookies with SameSite attribute).

**Current Code:**
```typescript
const TOKEN_KEY = 'dashgo_auth_token';
export const authStorage = {
  getToken: (): string | null => {
    return localStorage.getItem(TOKEN_KEY);
  },
  // ...
};
```

**Recommendation:**
1. Migrate to httpOnly + SameSite=Strict cookies
2. Add CSRF token to mutating API requests
3. Implement token rotation on authentication
4. Add Content-Security-Policy to mitigate XSS vectors

---

### F3: Missing Rate Limiting

**Severity:** MEDIUM
**Location:** `backend-go/internal/api/handlers.go`

**Description:**
The application has brute-force protection on the login endpoint (5 attempts, 15-minute lockout), but other sensitive endpoints lack rate limiting:

- Password change endpoint
- Tailscale authentication
- Container management operations
- Settings updates

**Recommendation:**
Implement rate limiting middleware for all sensitive endpoints. Consider using a token bucket or sliding window algorithm.

---

### F4: No HTTPS/TLS Enforcement

**Severity:** MEDIUM
**Location:** `backend-go/main.go`

**Description:**
The application does not enforce HTTPS connections:
- No HTTP to HTTPS redirect
- No HSTS headers configured
- No certificate validation options

This is particularly concerning for a dashboard that manages Docker containers and potentially Tailscale connections.

**Recommendation:**
1. Add HTTP to HTTPS redirect in production mode
2. Configure HSTS header with appropriate max-age
3. Document HTTPS requirements in deployment guide

---

### F5: Container ID Validation

**Severity:** LOW
**Location:** `backend-go/internal/api/handlers.go:211,222,232`

**Description:**
Container IDs are passed directly to Docker client functions without validation. While Docker SDK is expected to handle invalid IDs gracefully, explicitly validating the format provides defense-in-depth.

**Current Code:**
```go
func startContainer(c *gin.Context) {
    id := c.Param("id")
    if err := docker.StartContainer(id); err != nil {
        // ...
    }
}
```

**Recommendation:**
Add validation that container ID matches Docker's expected format (64-character hex string, or short ID format).

---

### F6: Missing Content-Security-Policy

**Severity:** LOW
**Location:** `backend-go/main.go`

**Description:**
No CSP headers are configured, leaving the frontend vulnerable to XSS attacks.

**Recommendation:**
Add CSP headers appropriate for an embedded single-page application:
```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'
```

---

### F7: Missing Security Headers

**Severity:** LOW
**Location:** `backend-go/main.go`

**Description:**
Standard security headers are missing:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`

**Recommendation:**
Add a security headers middleware:
```go
c.Header("X-Frame-Options", "DENY")
c.Header("X-Content-Type-Options", "nosniff")
c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
```

---

### F8: Minimum Password Length

**Severity:** LOW
**Location:** `backend-go/internal/auth/auth.go:33`

**Description:**
Minimum password length is 8 characters. OWASP recommends a minimum of 12 characters for passwords, with 16+ recommended for high-security applications.

**Current Code:**
```go
const MinPasswordLength = 8
```

**Recommendation:**
Increase minimum password length to at least 12 characters, or implement a password strength meter with configurable requirements.

---

## Positive Security Practices

The following security measures were verified as correctly implemented:

1. **Session Management**: 24-hour session TTL with cleanup goroutine
2. **Token Generation**: Cryptographically secure 32-byte random tokens
3. **Brute-Force Protection**: 5 failed attempts triggers 15-minute lockout
4. **SSRF Protection**: Webhook URL validation rejects private/internal addresses
5. **Docker Socket Security**: Read-only mount in docker-compose.yml
6. **CORS Configuration**: Disabled by default, only enabled with explicit origin
7. **Proxy Trust**: No proxies trusted by default (prevents XFF spoofing)
8. **Config File Permissions**: 0600 for sensitive config file
9. **Atomic Writes**: Temp file + rename pattern for config persistence
10. **Timeouts**: All Docker operations have explicit timeouts (10-30s)
11. **Error Handling**: Generic error messages without stack traces
12. **No SQL Injection**: JSON file storage, no database queries
13. **No Shell Injection**: No raw shell execution in handlers
14. **Input Validation**: Webhook URLs validated for SSRF protection

---

## Remediations (Priority Order)

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 1 | F1: Set bcrypt cost to 12 | Low | High |
| 2 | F4: Add HSTS and HTTPS redirect | Medium | High |
| 3 | F7: Add security headers middleware | Low | Medium |
| 4 | F6: Add CSP headers | Medium | Medium |
| 5 | F3: Implement rate limiting | Medium | Medium |
| 6 | F2: Migrate to httpOnly cookies | High | High |
| 7 | F5: Add container ID validation | Low | Low |
| 8 | F8: Increase password minimum | Low | Low |

