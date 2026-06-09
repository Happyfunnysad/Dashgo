package docker

import (
	"testing"

	"docker-dashboard/internal/models"
)

func TestGenerateAccessLinks_NoPortsReturnsEmpty(t *testing.T) {
	info := models.ContainerInfo{Ports: []models.PublishedPort{}}
	settings := models.Settings{LocalNetworkIP: "192.168.1.10", DefaultProtocol: "http"}
	links := generateAccessLinks(info, settings)
	if len(links) != 0 {
		t.Errorf("expected 0 links with no ports, got %d", len(links))
	}
}

func TestGenerateAccessLinks_LocalLink(t *testing.T) {
	info := models.ContainerInfo{
		Ports: []models.PublishedPort{{PublicPort: 8080, PrivatePort: 80, Type: "tcp"}},
	}
	settings := models.Settings{LocalNetworkIP: "10.0.0.5", DefaultProtocol: "http"}
	links := generateAccessLinks(info, settings)

	found := false
	for _, l := range links {
		if l.Type == "local" && l.URL == "http://10.0.0.5:8080" {
			found = true
		}
	}
	if !found {
		t.Errorf("expected local link http://10.0.0.5:8080, got %v", links)
	}
}

func TestGenerateAccessLinks_TailscaleAndDomain(t *testing.T) {
	info := models.ContainerInfo{
		Ports: []models.PublishedPort{{PublicPort: 3000, PrivatePort: 3000, Type: "tcp"}},
	}
	settings := models.Settings{
		TailscaleIP:     "100.64.0.1",
		Domain:          "myhost.example.com",
		DefaultProtocol: "https",
	}
	links := generateAccessLinks(info, settings)
	types := map[string]string{}
	for _, l := range links {
		types[l.Type] = l.URL
	}
	if types["tailscale"] != "https://100.64.0.1:3000" {
		t.Errorf("wrong tailscale URL: %q", types["tailscale"])
	}
	if types["domain"] != "https://myhost.example.com:3000" {
		t.Errorf("wrong domain URL: %q", types["domain"])
	}
}

func TestGenerateAccessLinks_PrimaryPortOverride(t *testing.T) {
	info := models.ContainerInfo{
		Ports: []models.PublishedPort{
			{PublicPort: 8080, PrivatePort: 80, Type: "tcp"},
			{PublicPort: 9090, PrivatePort: 9090, Type: "tcp"},
		},
		PrimaryPort: 9090,
	}
	settings := models.Settings{LocalNetworkIP: "1.2.3.4", DefaultProtocol: "http"}
	links := generateAccessLinks(info, settings)
	for _, l := range links {
		if l.Type == "local" && l.URL != "http://1.2.3.4:9090" {
			t.Errorf("PrimaryPort not respected: %q", l.URL)
		}
	}
}

func TestIsSensitiveEnvKey(t *testing.T) {
	sensitive := []string{
		"DB_PASSWORD", "API_KEY", "SECRET_TOKEN", "AUTH_TOKEN",
		"DATABASE_URL", "PRIVATE_KEY", "ACCESS_KEY_ID",
	}
	for _, k := range sensitive {
		if !isSensitiveEnvKey(k) {
			t.Errorf("isSensitiveEnvKey(%q) should be true", k)
		}
	}

	safe := []string{"PORT", "HOST", "LOG_LEVEL", "APP_NAME", "ENVIRONMENT"}
	for _, k := range safe {
		if isSensitiveEnvKey(k) {
			t.Errorf("isSensitiveEnvKey(%q) should be false", k)
		}
	}
}
