package auth_test

import (
	"testing"
	"time"

	"docker-dashboard/internal/auth"
)

func TestLoginLogoutCycle(t *testing.T) {
	// Set up a fresh password
	hash, err := auth.SetPassword("correcthorse")
	if err != nil {
		t.Fatalf("SetPassword: %v", err)
	}
	auth.SetPasswordHash(hash)

	token, err := auth.Login("correcthorse")
	if err != nil {
		t.Fatalf("Login failed: %v", err)
	}
	if token == "" {
		t.Fatal("expected non-empty token")
	}
	if !auth.ValidateToken(token) {
		t.Error("token should be valid after login")
	}

	auth.Logout(token)
	if auth.ValidateToken(token) {
		t.Error("token should be invalid after logout")
	}
}

func TestLoginWrongPassword(t *testing.T) {
	hash, _ := auth.SetPassword("secretpass99")
	auth.SetPasswordHash(hash)

	_, err := auth.Login("wrongpass")
	if err == nil {
		t.Fatal("expected error for wrong password, got nil")
	}
}

func TestIsConfigured(t *testing.T) {
	auth.SetPasswordHash("")
	if auth.IsConfigured() {
		t.Error("should not be configured with empty hash")
	}
	hash, _ := auth.SetPassword("validpass1")
	auth.SetPasswordHash(hash)
	if !auth.IsConfigured() {
		t.Error("should be configured after setting password")
	}
}

func TestBruteForceProtection(t *testing.T) {
	const key = "test-ip-brute"
	auth.ResetAttempts(key)

	// Register 5 failed attempts (the lockout threshold)
	for i := 0; i < 5; i++ {
		auth.RegisterFailedAttempt(key)
	}
	if auth.LockRemaining(key) <= 0 {
		t.Error("expected positive lock duration after threshold reached")
	}
}

func TestBruteForceReset(t *testing.T) {
	const key = "test-ip-reset"
	auth.ResetAttempts(key)

	for i := 0; i < 3; i++ {
		auth.RegisterFailedAttempt(key)
	}
	auth.ResetAttempts(key)
	if auth.LockRemaining(key) > 0 {
		t.Error("lock should be cleared after ResetAttempts")
	}
}

func TestCleanExpired(t *testing.T) {
	hash, _ := auth.SetPassword("cleantest1")
	auth.SetPasswordHash(hash)

	token, _ := auth.Login("cleantest1")
	if !auth.ValidateToken(token) {
		t.Fatal("token should be valid immediately after login")
	}

	// CleanExpired should not remove a fresh token
	auth.CleanExpired()
	if !auth.ValidateToken(token) {
		t.Error("CleanExpired should not remove a non-expired token")
	}
}

func TestLoginNotConfigured(t *testing.T) {
	auth.SetPasswordHash("")
	_, err := auth.Login("anything")
	if err != auth.ErrNotConfigured {
		t.Errorf("expected ErrNotConfigured, got %v", err)
	}
}

func TestGetPasswordHash(t *testing.T) {
	hash, _ := auth.SetPassword("hashtest12")
	auth.SetPasswordHash(hash)
	if got := auth.GetPasswordHash(); got != hash {
		t.Errorf("GetPasswordHash mismatch: got %q, want %q", got, hash)
	}
}

// Ensure the package compiles and time import is exercised
var _ = time.Second
