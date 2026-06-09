package db_test

import (
	"os"
	"path/filepath"
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
