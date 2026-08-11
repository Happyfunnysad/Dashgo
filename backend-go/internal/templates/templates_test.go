package templates

import (
	"context"
	"strings"
	"testing"

	"docker-dashboard/internal/models"
)

func TestNormalizePortainerTemplate(t *testing.T) {
	raw := map[string]any{
		"type":        float64(1),
		"title":       "Example App",
		"description": "Run [Example](https://example.com).",
		"image":       "example/app:latest",
		"ports":       []any{"8080:80/tcp"},
		"categories":  []any{"Tools", "Other"},
		"volumes": []any{map[string]any{
			"bind": "/srv/example", "container": "/config",
		}},
		"env": []any{map[string]any{
			"name": "TZ", "label": "Timezone", "default": "Etc/UTC",
		}},
	}

	item, ok := normalizePortainer(raw, "Catalog")
	if !ok {
		t.Fatal("expected template to normalize")
	}
	if item.Title != "Example App" || item.Image != "example/app:latest" {
		t.Fatalf("unexpected normalized template: %#v", item)
	}
	if item.ProjectURL != "https://example.com" {
		t.Fatalf("unexpected project URL: %q", item.ProjectURL)
	}
	if len(item.Ports) != 1 || len(item.Volumes) != 1 || len(item.Env) != 1 {
		t.Fatalf("template fields were not preserved: %#v", item)
	}
}

func TestNormalizePortainerSkipsSwarm(t *testing.T) {
	_, ok := normalizePortainer(map[string]any{"type": float64(2), "title": "Swarm"}, "Catalog")
	if ok {
		t.Fatal("Swarm templates should be skipped")
	}
}

func TestGenerateCompose(t *testing.T) {
	compose, err := GenerateCompose(context.Background(), models.TemplateItem{
		Title:         "Example App",
		Image:         "example/app:latest",
		RestartPolicy: "unless-stopped",
		Ports:         []string{"8080:80"},
		Volumes:       []models.TemplateVolume{{Bind: "/srv/example", Container: "/config"}},
		Env:           []models.TemplateEnv{{Name: "TZ", Default: "Etc/UTC"}},
	})
	if err != nil {
		t.Fatalf("GenerateCompose: %v", err)
	}
	for _, expected := range []string{
		"services:",
		"  example-app:",
		"    image: example/app:latest",
		`      - "8080:80"`,
		"      - /srv/example:/config",
		"      - TZ=Etc/UTC",
	} {
		if !strings.Contains(compose, expected) {
			t.Fatalf("compose is missing %q:\n%s", expected, compose)
		}
	}
}

func TestSlug(t *testing.T) {
	if got := Slug("  My App / Test  "); got != "my-app-test" {
		t.Fatalf("Slug: got %q", got)
	}
}
