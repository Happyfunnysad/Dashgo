package docker

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestSplitComposeConfigFiles(t *testing.T) {
	got := splitComposeConfigFiles(" /srv/app/compose.yaml, /srv/app/override.yml ")
	want := []string{"/srv/app/compose.yaml", "/srv/app/override.yml"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("splitComposeConfigFiles() = %#v, want %#v", got, want)
	}
}

func TestNormalizeComposePath(t *testing.T) {
	if got := normalizeComposePath("/srv/app", "compose.yaml"); got != "/srv/app/compose.yaml" {
		t.Fatalf("normalizeComposePath() = %q", got)
	}
	if got := normalizeComposePath("/ignored", "/opt/stacks/app.yml"); got != "/opt/stacks/app.yml" {
		t.Fatalf("absolute normalizeComposePath() = %q", got)
	}
}

func TestResolveComposePathUsesHostRoot(t *testing.T) {
	hostRoot := t.TempDir()
	hostPath := filepath.Join(hostRoot, "srv", "app", "compose.yaml")
	if err := os.MkdirAll(filepath.Dir(hostPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(hostPath, []byte("services: {}\n"), 0o640); err != nil {
		t.Fatal(err)
	}
	t.Setenv("HOST_ROOT", hostRoot)

	resolved, err := resolveComposePath("/srv/app/compose.yaml")
	if err != nil {
		t.Fatal(err)
	}
	if resolved != hostPath {
		t.Fatalf("resolveComposePath() = %q, want %q", resolved, hostPath)
	}
}

func TestValidateComposeYAML(t *testing.T) {
	if err := validateComposeYAML("services:\n  app:\n    image: nginx\n"); err != nil {
		t.Fatalf("valid compose rejected: %v", err)
	}
	if err := validateComposeYAML("services: [\n"); err == nil || !strings.Contains(err.Error(), "invalid YAML") {
		t.Fatalf("invalid compose accepted: %v", err)
	}
}

func TestReplaceComposeFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "compose.yaml")
	if err := os.WriteFile(path, []byte("services: {}\n"), 0o640); err != nil {
		t.Fatal(err)
	}
	if err := replaceComposeFile(path, "services:\n  app:\n    image: nginx\n"); err != nil {
		t.Fatal(err)
	}
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(content) != "services:\n  app:\n    image: nginx\n" {
		t.Fatalf("unexpected content: %q", content)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o640 {
		t.Fatalf("permissions = %o, want 640", info.Mode().Perm())
	}
}
