package updater

import (
	"context"
	"log"
	"strings"
	"sync"
	"time"

	"docker-dashboard/internal/models"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/client"
)

var (
	mu       sync.RWMutex
	statuses []models.ImageUpdateStatus
	cli      *client.Client
)

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
		if strings.HasPrefix(imgName, "sha256:") || !strings.Contains(imgName, "/") && !strings.Contains(imgName, ":") {
			// Try to add :latest for bare names like "nginx"
			if !strings.Contains(imgName, ":") {
				imgName = imgName + ":latest"
			}
		}
		if strings.HasPrefix(imgName, "sha256:") {
			continue
		}

		status := models.ImageUpdateStatus{
			ContainerID:   c.ID[:12],
			ContainerName: name,
			Image:         imgName,
			CheckedAt:     now,
		}

		// Get current local image digest
		localInspect, _, err := cli.ImageInspectWithRaw(ctx, c.ImageID)
		if err != nil {
			continue
		}
		if len(localInspect.RepoDigests) > 0 {
			status.CurrentDigest = extractDigest(localInspect.RepoDigests[0])
		}

		// Pull latest manifest to check for updates
		// Use a short timeout per image
		pullCtx, pullCancel := context.WithTimeout(ctx, 30*time.Second)
		reader, err := cli.ImagePull(pullCtx, imgName, image.PullOptions{})
		if err != nil {
			pullCancel()
			// Can't reach registry or private image — skip
			newStatuses = append(newStatuses, status)
			continue
		}
		// We need to consume the reader but don't need the output
		buf := make([]byte, 4096)
		for {
			_, readErr := reader.Read(buf)
			if readErr != nil {
				break
			}
		}
		reader.Close()
		pullCancel()

		// Re-inspect the image after pull
		remoteInspect, _, err := cli.ImageInspectWithRaw(ctx, imgName)
		if err != nil {
			newStatuses = append(newStatuses, status)
			continue
		}
		if len(remoteInspect.RepoDigests) > 0 {
			status.LatestDigest = extractDigest(remoteInspect.RepoDigests[0])
		}

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

func extractDigest(repoDigest string) string {
	parts := strings.SplitN(repoDigest, "@", 2)
	if len(parts) == 2 {
		return parts[1]
	}
	return repoDigest
}
