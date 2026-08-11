package db

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	"docker-dashboard/internal/models"
	"docker-dashboard/internal/utils"
)

type Config struct {
	Settings        models.Settings         `json:"settings"`
	Aliases         map[string]models.Alias `json:"aliases"`
	TemplateSources []models.TemplateSource `json:"templateSources"`
	PasswordHash    string                  `json:"passwordHash,omitempty"`
}

var (
	config     Config
	configLock sync.RWMutex
	configPath string
)

var defaultTemplateSources = []models.TemplateSource{
	{ID: 1, SourceID: "portainer-lissy93", Name: "Portainer templates (Lissy93)", URL: "https://raw.githubusercontent.com/Lissy93/portainer-templates/main/templates.json", Enabled: true, Builtin: true, SortOrder: 0},
	{ID: 2, SourceID: "ntv-one", Name: "NTV-One (consolidated)", URL: "https://raw.githubusercontent.com/ntv-one/portainer/main/template.json", Enabled: false, Builtin: true, SortOrder: 1},
	{ID: 3, SourceID: "mlva", Name: "MLVA (TheLustriVA)", URL: "https://raw.githubusercontent.com/TheLustriVA/portainer-templates-Nov-2022-collection/main/templates_2_2_rc_2_2.json", Enabled: false, Builtin: true, SortOrder: 2},
	{ID: 4, SourceID: "selfhostedpro", Name: "SelfHostedPro", URL: "https://raw.githubusercontent.com/SelfhostedPro/selfhosted_templates/master/Template/portainer-v2.json", Enabled: false, Builtin: true, SortOrder: 3},
	{ID: 5, SourceID: "portainer-qballjos", Name: "Qballjos (homelab)", URL: "https://raw.githubusercontent.com/Qballjos/portainer_templates/master/Template/template.json", Enabled: false, Builtin: true, SortOrder: 4},
	{ID: 6, SourceID: "lsio-technorabilia", Name: "LinuxServer.io (Technorabilia)", URL: "https://raw.githubusercontent.com/technorabilia/portainer-templates/main/lsio/templates/templates.json", Enabled: true, Builtin: true, SortOrder: 5},
	{ID: 7, SourceID: "mikestraney", Name: "MikeStraney", URL: "https://raw.githubusercontent.com/mikestraney/portainer-templates/master/templates.json", Enabled: false, Builtin: true, SortOrder: 6},
	{ID: 8, SourceID: "pi-hosted-amd64", Name: "Pi-Hosted (amd64)", URL: "https://raw.githubusercontent.com/pi-hosted/pi-hosted/master/template/portainer-v2-amd64.json", Enabled: false, Builtin: true, SortOrder: 7},
	{ID: 9, SourceID: "pi-hosted-arm64", Name: "Pi-Hosted (arm64)", URL: "https://raw.githubusercontent.com/pi-hosted/pi-hosted/master/template/portainer-v2-arm64.json", Enabled: false, Builtin: true, SortOrder: 8},
}

func cloneDefaultTemplateSources() []models.TemplateSource {
	return append([]models.TemplateSource(nil), defaultTemplateSources...)
}

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
	config.TemplateSources = cloneDefaultTemplateSources()

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
			config.TemplateSources = cloneDefaultTemplateSources()
			config.PasswordHash = ""
		} else {
			if config.Aliases == nil {
				config.Aliases = make(map[string]models.Alias)
			}
			if len(config.TemplateSources) == 0 {
				config.TemplateSources = cloneDefaultTemplateSources()
			}
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

func GetTemplateSources() []models.TemplateSource {
	configLock.RLock()
	defer configLock.RUnlock()
	return append([]models.TemplateSource(nil), config.TemplateSources...)
}

func UpdateTemplateSource(id int, enabled *bool, name, sourceURL *string) error {
	configLock.Lock()
	defer configLock.Unlock()

	for i := range config.TemplateSources {
		if config.TemplateSources[i].ID != id {
			continue
		}
		if enabled != nil {
			config.TemplateSources[i].Enabled = *enabled
		}
		if name != nil {
			config.TemplateSources[i].Name = *name
		}
		if sourceURL != nil {
			config.TemplateSources[i].URL = *sourceURL
		}
		return saveConfig()
	}
	return os.ErrNotExist
}

func AddTemplateSource(name, sourceURL string) (models.TemplateSource, error) {
	configLock.Lock()
	defer configLock.Unlock()

	nextID := 1
	nextOrder := 0
	for _, source := range config.TemplateSources {
		if source.ID >= nextID {
			nextID = source.ID + 1
		}
		if source.SortOrder >= nextOrder {
			nextOrder = source.SortOrder + 1
		}
	}

	source := models.TemplateSource{
		ID:        nextID,
		SourceID:  fmt.Sprintf("custom-%d", time.Now().UnixMilli()),
		Name:      name,
		URL:       sourceURL,
		Enabled:   true,
		Builtin:   false,
		SortOrder: nextOrder,
	}
	config.TemplateSources = append(config.TemplateSources, source)
	if err := saveConfig(); err != nil {
		config.TemplateSources = config.TemplateSources[:len(config.TemplateSources)-1]
		return models.TemplateSource{}, err
	}
	return source, nil
}

func DeleteTemplateSource(id int) error {
	configLock.Lock()
	defer configLock.Unlock()

	for i, source := range config.TemplateSources {
		if source.ID != id {
			continue
		}
		if source.Builtin {
			return fmt.Errorf("built-in template sources cannot be deleted")
		}
		removed := source
		config.TemplateSources = append(config.TemplateSources[:i], config.TemplateSources[i+1:]...)
		if err := saveConfig(); err != nil {
			config.TemplateSources = append(config.TemplateSources, models.TemplateSource{})
			copy(config.TemplateSources[i+1:], config.TemplateSources[i:])
			config.TemplateSources[i] = removed
			return err
		}
		return nil
	}
	return os.ErrNotExist
}
