package updater

import (
	"testing"
)

// TestExtractDigest verifies that the digest is correctly parsed from a
// repo-digest string of the form "name@sha256:...".
func TestExtractDigest(t *testing.T) {
	cases := []struct {
		input string
		want  string
	}{
		{"nginx@sha256:abc123", "sha256:abc123"},
		{"ghcr.io/owner/repo@sha256:deadbeef", "sha256:deadbeef"},
		{"sha256:alreadydigest", "sha256:alreadydigest"},
		{"", ""},
	}
	for _, tc := range cases {
		got := extractDigest(tc.input)
		if got != tc.want {
			t.Errorf("extractDigest(%q) = %q, want %q", tc.input, got, tc.want)
		}
	}
}

// TestParseImageRef verifies registry/name/tag splitting for various image
// reference formats.
func TestParseImageRef(t *testing.T) {
	cases := []struct {
		ref              string
		wantReg, wantName, wantTag string
	}{
		// Bare Docker Hub official image
		{"nginx", "registry-1.docker.io", "library/nginx", "latest"},
		// Docker Hub official with explicit tag
		{"nginx:1.25", "registry-1.docker.io", "library/nginx", "1.25"},
		// Docker Hub user image
		{"myuser/myapp:v2", "registry-1.docker.io", "myuser/myapp", "v2"},
		// GHCR image
		{"ghcr.io/owner/repo:sha-abc", "ghcr.io", "owner/repo", "sha-abc"},
		// Custom registry with port
		{"myregistry.example.com:5000/myapp:latest", "myregistry.example.com:5000", "myapp", "latest"},
	}
	for _, tc := range cases {
		reg, name, tag := parseImageRef(tc.ref)
		if reg != tc.wantReg || name != tc.wantName || tag != tc.wantTag {
			t.Errorf("parseImageRef(%q) = (%q, %q, %q), want (%q, %q, %q)",
				tc.ref, reg, name, tag, tc.wantReg, tc.wantName, tc.wantTag)
		}
	}
}
