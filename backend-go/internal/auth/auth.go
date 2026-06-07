package auth

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

var (
	ErrInvalidCredentials = errors.New("invalid password")
	ErrNotConfigured      = errors.New("auth not configured")
	ErrInvalidToken       = errors.New("invalid or expired token")
)

// Session represents an active auth session.
type Session struct {
	Token     string
	ExpiresAt time.Time
}

var (
	mu           sync.RWMutex
	passwordHash string        // bcrypt hash stored in config
	sessions     = make(map[string]Session)
	sessionTTL   = 24 * time.Hour
)

// SetPasswordHash loads the bcrypt hash from config on startup.
func SetPasswordHash(hash string) {
	mu.Lock()
	defer mu.Unlock()
	passwordHash = hash
}

// GetPasswordHash returns the current hash (for config persistence).
func GetPasswordHash() string {
	mu.RLock()
	defer mu.RUnlock()
	return passwordHash
}

// IsConfigured returns true if a password has been set.
func IsConfigured() bool {
	mu.RLock()
	defer mu.RUnlock()
	return passwordHash != ""
}

// SetPassword hashes and stores a new password. Returns the bcrypt hash.
func SetPassword(plaintext string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(plaintext), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	mu.Lock()
	passwordHash = string(hash)
	mu.Unlock()
	return string(hash), nil
}

// Login checks the password and returns a session token.
func Login(plaintext string) (string, error) {
	mu.RLock()
	hash := passwordHash
	mu.RUnlock()

	if hash == "" {
		return "", ErrNotConfigured
	}

	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(plaintext)); err != nil {
		return "", ErrInvalidCredentials
	}

	token, err := generateToken()
	if err != nil {
		return "", err
	}

	mu.Lock()
	sessions[token] = Session{
		Token:     token,
		ExpiresAt: time.Now().Add(sessionTTL),
	}
	mu.Unlock()

	return token, nil
}

// ValidateToken checks if a session token is valid and not expired.
func ValidateToken(token string) bool {
	mu.RLock()
	session, exists := sessions[token]
	mu.RUnlock()

	if !exists {
		return false
	}

	if time.Now().After(session.ExpiresAt) {
		// Clean up expired session
		mu.Lock()
		delete(sessions, token)
		mu.Unlock()
		return false
	}

	return true
}

// Logout removes a session.
func Logout(token string) {
	mu.Lock()
	delete(sessions, token)
	mu.Unlock()
}

// CleanExpired removes all expired sessions. Call periodically.
func CleanExpired() {
	mu.Lock()
	defer mu.Unlock()
	now := time.Now()
	for token, session := range sessions {
		if now.After(session.ExpiresAt) {
			delete(sessions, token)
		}
	}
}

func generateToken() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}
