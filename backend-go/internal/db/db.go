package db

import (
	"encoding/json"
	"io/ioutil"
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

	// Default settings
	config.Settings = models.Settings{
		DefaultProtocol:     "http",
		AutoRefreshInterval: 10,
	}
	config.Aliases = make(map[string]models.Alias)

	// Load if exists
	if _, err := os.Stat(configPath); err == nil {
		data, err := ioutil.ReadFile(configPath)
		if err != nil {
			return err
		}
		if err := json.Unmarshal(data, &config); err != nil {
			return err
		}
	}

	return saveConfig()
}

func saveConfig() error {
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return err
	}
	return ioutil.WriteFile(configPath, data, 0644)
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
