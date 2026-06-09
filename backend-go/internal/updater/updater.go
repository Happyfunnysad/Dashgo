package updater

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"docker-dashboard/internal/models"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
)

var (
	mu       sync.RWMutex
	statuses []models.ImageUpdateStatus
	cli      *client.Client
)

// registryClient is used for all registry manifest requests.
// A generous timeout prevents a slow registry from blocking the check loop.
var registryClient = &http.Client{Timeout: 20 * time.Second}

// Init starts the background updater goroutine.
func Init(dockerClient *client.Client, interval time.Duration) {
	cli = dockerClient
	go func() {
		// Initial check after 30s startup delay
		time.Sleep(30 * time.Second)
		checkAllUpdates()

		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for range ticker.C {
			checkAllUpdates()
		}
	}()
	log.Printf("📦 Update checker started (interval: %s)", interval)
}

// GetStatuses returns the current update statuses.
func GetStatuses() []models.ImageUpdateStatus {
	mu.RLock()
	defer mu.RUnlock()
	result := make([]models.ImageUpdateStatus, len(statuses))
	copy(result, statuses)
	return result
}

// CheckNow triggers an immediate update check.
func CheckNow() []models.ImageUpdateStatus {
	checkAllUpdates()
	return GetStatuses()
}

func checkAllUpdates() {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	containers, err := cli.ContainerList(ctx, container.ListOptions{All: true})
	if err != nil {
		log.Printf("Updater: failed to list containers: %v", err)
		return
	}

	var newStatuses []models.ImageUpdateStatus
	now := time.Now().Unix()

	for _, c := range containers {
		imgName := c.Image
		name := "unknown"
		if len(c.Names) > 0 {
			name = strings.TrimPrefix(c.Names[0], "/")
		}

		// Skip images without a tag (local builds, sha256 refs)
		if strings.HasPrefix(imgName, "sha256:") {
			continue
		}
		if !strings.Contains(imgName, ":") {
			imgName = imgName + ":latest"
		}

		status := models.ImageUpdateStatus{
			ContainerID:   c.ID[:12],
			ContainerName: name,
			Image:         imgName,
			CheckedAt:     now,
		}

		// Get current local image digest from RepoDigests
		localInspect, _, err := cli.ImageInspectWithRaw(ctx, c.ImageID)
		if err != nil {
			newStatuses = append(newStatuses, status)
			continue
		}
		if len(localInspect.RepoDigests) > 0 {
			status.CurrentDigest = extractDigest(localInspect.RepoDigests[0])
		}

		// Fetch the remote manifest digest via Registry API (no layer download)
		remoteDigest, err := fetchManifestDigest(imgName)
		if err != nil {
			log.Printf("Updater: manifest check failed for %s: %v", imgName, err)
			newStatuses = append(newStatuses, status)
			continue
		}
		status.LatestDigest = remoteDigest

		// Compare digests
		if status.CurrentDigest != "" && status.LatestDigest != "" {
			status.UpdateAvail = status.CurrentDigest != status.LatestDigest
		}

		newStatuses = append(newStatuses, status)
	}

	mu.Lock()
	statuses = newStatuses
	mu.Unlock()

	updateCount := 0
	for _, s := range newStatuses {
		if s.UpdateAvail {
			updateCount++
		}
	}
	log.Printf("📦 Update check complete: %d containers, %d updates available", len(newStatuses), updateCount)
}

// fetchManifestDigest retrieves the content digest of an image tag from its
// registry using a manifest HEAD/GET request. No image layers are downloaded.
//
// Supported registries:
//   - Docker Hub (docker.io / no host prefix) — anonymous token auth
//   - Any other registry — direct unauthenticated HEAD request
func fetchManifestDigest(imageRef string) (string, error) {
	registry, name, tag := parseImageRef(imageRef)

	if registry == "registry-1.docker.io" {
		return fetchDockerHubDigest(name, tag)
	}
	return fetchGenericDigest(registry, name, tag)
}

// parseImageRef splits an image reference into (registry, name, tag).
// Examples:
//
//	"nginx:latest"                   → ("registry-1.docker.io", "library/nginx", "latest")
//	"myuser/myapp:v1.2"              → ("registry-1.docker.io", "myuser/myapp", "v1.2")
//	"ghcr.io/owner/repo:sha-abc123"  → ("ghcr.io", "owner/repo", "sha-abc123")
func parseImageRef(ref string) (registry, name, tag string) {
	tag = "latest"
	if idx := strings.LastIndex(ref, ":"); idx != -1 {
		// Distinguish tag from port (e.g. "host:5000/img:tag")
		afterColon := ref[idx+1:]
		if !strings.Contains(afterColon, "/") {
			tag = afterColon
			ref = ref[:idx]
		}
	}

	// Check for explicit registry host (contains a dot or colon before first slash)
	parts := strings.SplitN(ref, "/", 2)
	if len(parts) == 2 && (strings.ContainsAny(parts[0], ".:") || parts[0] == "localhost") {
		registry = parts[0]
		name = parts[1]
		return
	}

	// Docker Hub
	registry = "registry-1.docker.io"
	if len(parts) == 1 {
		name = "library/" + parts[0]
	} else {
		name = ref
	}
	return
}

// fetchDockerHubDigest uses the Docker Hub token auth flow to fetch a manifest
// digest without downloading any layers.
func fetchDockerHubDigest(name, tag string) (string, error) {
	// Step 1: get anonymous token scoped to the image
	tokenURL := fmt.Sprintf(
		"https://auth.docker.io/token?service=registry.docker.io&scope=repository:%s:pull",
		name,
	)
	resp, err := registryClient.Get(tokenURL)
	if err != nil {
		return "", fmt.Errorf("docker hub token request: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	var tokenResp struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(body, &tokenResp); err != nil || tokenResp.Token == "" {
		return "", fmt.Errorf("docker hub token parse failed")
	}

	// Step 2: HEAD the manifest to get the digest header
	manifestURL := fmt.Sprintf("https://registry-1.docker.io/v2/%s/manifests/%s", name, tag)
	req, err := http.NewRequest(http.MethodHead, manifestURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+tokenResp.Token)
	// Accept both schema v2 and OCI manifests
	req.Header.Set("Accept", "application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json")

	mResp, err := registryClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("manifest HEAD request: %w", err)
	}
	defer mResp.Body.Close()

	digest := mResp.Header.Get("Docker-Content-Digest")
	if digest == "" {
		return "", fmt.Errorf("no Docker-Content-Digest header in response (status %d)", mResp.StatusCode)
	}
	return digest, nil
}

// fetchGenericDigest fetches a manifest digest from a non-Docker-Hub registry.
// Attempts unauthenticated HEAD first; skips on auth challenge rather than
// failing loudly, since we cannot know credentials here.
func fetchGenericDigest(registry, name, tag string) (string, error) {
	manifestURL := fmt.Sprintf("https://%s/v2/%s/manifests/%s", registry, name, tag)
	req, err := http.NewRequest(http.MethodHead, manifestURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json")

	resp, err := registryClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("manifest HEAD: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return "", fmt.Errorf("registry requires authentication (skipping %s/%s:%s)", registry, name, tag)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("registry returned HTTP %d for %s/%s:%s", resp.StatusCode, registry, name, tag)
	}

	digest := resp.Header.Get("Docker-Content-Digest")
	if digest == "" {
		return "", fmt.Errorf("no Docker-Content-Digest header from %s", registry)
	}
	return digest, nil
}

func extractDigest(repoDigest string) string {
	parts := strings.SplitN(repoDigest, "@", 2)
	if len(parts) == 2 {
		return parts[1]
	}
	return repoDigest
}
