package db

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"sync"

	"docker-dashboard/internal/models"
	"docker-dashboard/internal/utils"
)

type Config struct {
	Settings     models.Settings         `json:"settings"`
	Aliases      map[string]models.Alias `json:"aliases"`
	PasswordHash string                  `json:"passwordHash,omitempty"`
}

var (
	config     Config
	configLock sync.RWMutex
	configPath string
)

func InitDB(path string) error {
	configPath = path
	
	// Ensure directory exists
	dir := filepath.Dir(configPath)
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return err
		}
	}

	// Initialize encryption key
	if err := initEncryptionKey(); err != nil {
		return err
	}

	// Default settings
	config.Settings = models.Settings{
		DefaultProtocol:     "http",
		AutoRefreshInterval: 10,
	}
	config.Aliases = make(map[string]models.Alias)

	// Load if exists
	if _, err := os.Stat(configPath); err == nil {
		data, err := os.ReadFile(configPath)
		if err != nil {
			return err
		}
		if err := json.Unmarshal(data, &config); err != nil {
			// Corrupted config: log warning, reset, and save fresh
			log.Printf("Warning: Failed to parse config file (corrupted JSON). Resetting config: %v", err)
			config.Settings = models.Settings{
				DefaultProtocol:     "http",
				AutoRefreshInterval: 10,
			}
			config.Aliases = make(map[string]models.Alias)
			config.PasswordHash = ""
		} else {
			// Decrypt sensitive settings
			if dec, err := decrypt(config.Settings.LocalNetworkIP); err == nil {
				config.Settings.LocalNetworkIP = dec
			}
			if dec, err := decrypt(config.Settings.TailscaleIP); err == nil {
				config.Settings.TailscaleIP = dec
			}
			if dec, err := decrypt(config.Settings.TailscaleHostname); err == nil {
				config.Settings.TailscaleHostname = dec
			}
			if dec, err := decrypt(config.Settings.Domain); err == nil {
				config.Settings.Domain = dec
			}
			if dec, err := decrypt(config.Settings.WebhookURL); err == nil {
				config.Settings.WebhookURL = dec
			}
		}
	}

	return saveConfig()
}

// saveConfig writes the config atomically (write to a temp file in the same
// directory, then rename) with 0600 perms so the bcrypt password hash is not
// world-readable and a crash mid-write cannot corrupt the existing config.
func saveConfig() error {
	// Create a copy of the config to encrypt before saving
	configCopy := config

	// Encrypt sensitive settings
	var err error
	configCopy.Settings.LocalNetworkIP, err = encrypt(configCopy.Settings.LocalNetworkIP)
	if err != nil {
		return err
	}
	configCopy.Settings.TailscaleIP, err = encrypt(configCopy.Settings.TailscaleIP)
	if err != nil {
		return err
	}
	configCopy.Settings.TailscaleHostname, err = encrypt(configCopy.Settings.TailscaleHostname)
	if err != nil {
		return err
	}
	configCopy.Settings.Domain, err = encrypt(configCopy.Settings.Domain)
	if err != nil {
		return err
	}
	configCopy.Settings.WebhookURL, err = encrypt(configCopy.Settings.WebhookURL)
	if err != nil {
		return err
	}

	data, err := json.MarshalIndent(configCopy, "", "  ")
	if err != nil {
		return err
	}

	dir := filepath.Dir(configPath)
	tmp, err := os.CreateTemp(dir, ".config-*.tmp")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)

	if err := tmp.Chmod(0600); err != nil {
		tmp.Close()
		return err
	}
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpName, configPath)
}

func GetSettings() models.Settings {
	configLock.RLock()
	s := config.Settings
	configLock.RUnlock()

	// Auto-detect IPs if empty
	if s.LocalNetworkIP == "" {
		s.LocalNetworkIP = utils.GetLocalIP()
	}
	if s.TailscaleIP == "" {
		s.TailscaleIP = utils.GetTailscaleIP()
	}

	return s
}

func UpdateSettings(s models.Settings) (models.Settings, error) {
	configLock.Lock()
	defer configLock.Unlock()
	
	config.Settings = s
	err := saveConfig()
	return config.Settings, err
}

func GetAliases() map[string]models.Alias {
	configLock.RLock()
	defer configLock.RUnlock()
	
	// Return a copy
	res := make(map[string]models.Alias)
	for k, v := range config.Aliases {
		res[k] = v
	}
	return res
}

func UpsertAlias(a models.Alias) (models.Alias, error) {
	configLock.Lock()
	defer configLock.Unlock()
	
	config.Aliases[a.ContainerID] = a
	err := saveConfig()
	return a, err
}

func DeleteAlias(containerID string) error {
	configLock.Lock()
	defer configLock.Unlock()
	
	delete(config.Aliases, containerID)
	return saveConfig()
}

func GetPasswordHash() string {
	configLock.RLock()
	defer configLock.RUnlock()
	return config.PasswordHash
}

func SetPasswordHash(hash string) error {
	configLock.Lock()
	defer configLock.Unlock()
	config.PasswordHash = hash
	return saveConfig()
}
