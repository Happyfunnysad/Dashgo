package db_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"docker-dashboard/internal/db"
	"docker-dashboard/internal/models"
)

func TestInitDB_CreatesDir(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "subdir")
	path := filepath.Join(dir, "config.json")

	if err := db.InitDB(path); err != nil {
		t.Fatalf("InitDB: %v", err)
	}
	if _, err := os.Stat(path); err != nil {
		t.Errorf("config file not created: %v", err)
	}
}

func TestDefaultSettings(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	if err := db.InitDB(path); err != nil {
		t.Fatalf("InitDB: %v", err)
	}
	s := db.GetSettings()
	if s.DefaultProtocol == "" {
		t.Error("DefaultProtocol should have a default value")
	}
	if s.AutoRefreshInterval == 0 {
		t.Error("AutoRefreshInterval should have a default value")
	}
}

func TestUpdateAndGetSettings(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	if err := db.InitDB(path); err != nil {
		t.Fatalf("InitDB: %v", err)
	}
	want := models.Settings{
		LocalNetworkIP:      "192.168.1.50",
		DefaultProtocol:     "https",
		AutoRefreshInterval: 30,
	}
	got, err := db.UpdateSettings(want)
	if err != nil {
		t.Fatalf("UpdateSettings: %v", err)
	}
	if got.LocalNetworkIP != want.LocalNetworkIP {
		t.Errorf("LocalNetworkIP: got %q, want %q", got.LocalNetworkIP, want.LocalNetworkIP)
	}
	if got.DefaultProtocol != want.DefaultProtocol {
		t.Errorf("DefaultProtocol: got %q, want %q", got.DefaultProtocol, want.DefaultProtocol)
	}
}

func TestUpsertAndDeleteAlias(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	if err := db.InitDB(path); err != nil {
		t.Fatalf("InitDB: %v", err)
	}

	alias := models.Alias{
		ContainerID:   "abc123",
		ContainerName: "myapp",
		Alias:         "My App",
		PrimaryPort:   8080,
		Protocol:      "http",
	}
	saved, err := db.UpsertAlias(alias)
	if err != nil {
		t.Fatalf("UpsertAlias: %v", err)
	}
	if saved.Alias != "My App" {
		t.Errorf("alias mismatch: %q", saved.Alias)
	}

	aliases := db.GetAliases()
	if _, ok := aliases["abc123"]; !ok {
		t.Error("expected alias to exist after upsert")
	}

	if err := db.DeleteAlias("abc123"); err != nil {
		t.Fatalf("DeleteAlias: %v", err)
	}
	aliases = db.GetAliases()
	if _, ok := aliases["abc123"]; ok {
		t.Error("alias should not exist after delete")
	}
}

func TestSetAndGetPasswordHash(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	if err := db.InitDB(path); err != nil {
		t.Fatalf("InitDB: %v", err)
	}
	if err := db.SetPasswordHash("$2a$10$fakehashvalue"); err != nil {
		t.Fatalf("SetPasswordHash: %v", err)
	}
	if got := db.GetPasswordHash(); got != "$2a$10$fakehashvalue" {
		t.Errorf("GetPasswordHash: got %q", got)
	}
}

func TestConfigRoundTrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	if err := db.InitDB(path); err != nil {
		t.Fatalf("InitDB: %v", err)
	}
	_, _ = db.UpdateSettings(models.Settings{DefaultProtocol: "https", AutoRefreshInterval: 60})
	_, _ = db.UpsertAlias(models.Alias{ContainerID: "c1", Alias: "Test"})

	// Re-init from same file to verify persistence
	if err := db.InitDB(path); err != nil {
		t.Fatalf("second InitDB: %v", err)
	}
	aliases := db.GetAliases()
	if _, ok := aliases["c1"]; !ok {
		t.Error("alias should persist across InitDB re-load")
	}
}

func TestInitDB_CorruptedConfig(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")

	// Write invalid JSON
	if err := os.WriteFile(path, []byte("{invalid-json"), 0600); err != nil {
		t.Fatalf("failed to write invalid config: %v", err)
	}

	// InitDB should handle corruption, reset to defaults, and save a valid config
	if err := db.InitDB(path); err != nil {
		t.Fatalf("InitDB with corrupted config: %v", err)
	}

	// Verify file is now valid JSON
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("failed to read recreated config: %v", err)
	}

	var parsed map[string]interface{}
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Errorf("recreated config is not valid JSON: %v", err)
	}

	// Verify defaults
	s := db.GetSettings()
	if s.DefaultProtocol != "http" {
		t.Errorf("expected DefaultProtocol 'http', got %q", s.DefaultProtocol)
	}
}

func TestInitDB_EncryptionInFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	if err := db.InitDB(path); err != nil {
		t.Fatalf("InitDB: %v", err)
	}

	domain := "my-secret-domain.com"
	webhook := "https://discord.com/api/webhooks/123"
	tailscaleIP := "100.1.2.3"
	tailscaleHost := "my-tailscale-node"
	localIP := "192.168.1.100"

	settings := models.Settings{
		LocalNetworkIP:      localIP,
		TailscaleIP:         tailscaleIP,
		TailscaleHostname:   tailscaleHost,
		Domain:              domain,
		WebhookURL:          webhook,
		DefaultProtocol:     "https",
		AutoRefreshInterval: 15,
	}

	if _, err := db.UpdateSettings(settings); err != nil {
		t.Fatalf("UpdateSettings: %v", err)
	}

	// Verify they are decrypted in memory
	inMemory := db.GetSettings()
	if inMemory.Domain != domain {
		t.Errorf("in-memory domain: got %q, want %q", inMemory.Domain, domain)
	}
	if inMemory.WebhookURL != webhook {
		t.Errorf("in-memory webhook: got %q, want %q", inMemory.WebhookURL, webhook)
	}

	// Read raw config file and verify values are NOT present as plaintext, but encrypted
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("failed to read config file: %v", err)
	}

	content := string(data)
	if strings.Contains(content, domain) {
		t.Errorf("raw config file contains plaintext domain: %q", domain)
	}
	if strings.Contains(content, webhook) {
		t.Errorf("raw config file contains plaintext webhook: %q", webhook)
	}
	if strings.Contains(content, tailscaleIP) {
		t.Errorf("raw config file contains plaintext tailscaleIP: %q", tailscaleIP)
	}
	if strings.Contains(content, tailscaleHost) {
		t.Errorf("raw config file contains plaintext tailscaleHost: %q", tailscaleHost)
	}
	if strings.Contains(content, localIP) {
		t.Errorf("raw config file contains plaintext localIP: %q", localIP)
	}

	// Re-init and verify it gets decrypted
	if err := db.InitDB(path); err != nil {
		t.Fatalf("re-init: %v", err)
	}

	reLoaded := db.GetSettings()
	if reLoaded.Domain != domain {
		t.Errorf("reloaded domain: got %q, want %q", reLoaded.Domain, domain)
	}
	if reLoaded.WebhookURL != webhook {
		t.Errorf("reloaded webhook: got %q, want %q", reLoaded.WebhookURL, webhook)
	}
}
