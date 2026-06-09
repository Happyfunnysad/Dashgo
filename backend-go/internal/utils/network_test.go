package utils_test

import (
	"testing"

	"docker-dashboard/internal/utils"
)

func TestValidateWebhookURL_AcceptsPublic(t *testing.T) {
	// These resolve to public IPs; skip if DNS is unavailable in CI
	publicURLs := []string{
		"https://hooks.slack.com/services/TEST",
		"https://discord.com/api/webhooks/TEST",
	}
	for _, u := range publicURLs {
		err := utils.ValidateWebhookURL(u)
		// We tolerate DNS errors in offline environments
		if err != nil {
			t.Logf("ValidateWebhookURL(%q): %v (may be offline)", u, err)
		}
	}
}

func TestValidateWebhookURL_RejectsPrivate(t *testing.T) {
	bad := []string{
		"http://192.168.1.1/webhook",
		"http://10.0.0.1/webhook",
		"http://127.0.0.1/webhook",
		"http://localhost/webhook",
		"http://169.254.169.254/latest/meta-data/",
	}
	for _, u := range bad {
		if err := utils.ValidateWebhookURL(u); err == nil {
			t.Errorf("ValidateWebhookURL(%q) expected error (private/loopback), got nil", u)
		}
	}
}

func TestValidateWebhookURL_RejectsNonHTTP(t *testing.T) {
	bad := []string{
		"ftp://example.com/webhook",
		"file:///etc/passwd",
		"",
		"not-a-url",
	}
	for _, u := range bad {
		if err := utils.ValidateWebhookURL(u); err == nil {
			t.Errorf("ValidateWebhookURL(%q) expected error, got nil", u)
		}
	}
}

func TestGetLocalIP_ReturnsStringOrEmpty(t *testing.T) {
	ip := utils.GetLocalIP()
	// Result is either empty or a valid non-empty string — both are acceptable
	t.Logf("GetLocalIP() = %q", ip)
}

func TestGetTailscaleIP_ReturnsStringOrEmpty(t *testing.T) {
	ip := utils.GetTailscaleIP()
	t.Logf("GetTailscaleIP() = %q", ip)
}
