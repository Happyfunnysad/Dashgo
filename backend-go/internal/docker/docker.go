package docker

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"docker-dashboard/internal/db"
	"docker-dashboard/internal/models"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
)

var cli *client.Client

// ErrDockerUnavailable is returned when the Docker client failed to initialize
// (e.g. the daemon is not reachable), so handlers respond with a clear error
// instead of panicking on a nil client.
var ErrDockerUnavailable = errors.New("docker is not available (is the Docker daemon running and the socket mounted?)")

func ensureClient() error {
	if cli == nil {
		return ErrDockerUnavailable
	}
	return nil
}

func InitClient() error {
	var err error
	cli, err = client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	return err
}

// withTimeout wraps parent with a deadline. Use this for every Docker SDK call
// so a hung daemon cannot block handler goroutines indefinitely.
func withTimeout(parent context.Context, d time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(parent, d)
}

func GetRunningContainers() ([]models.ContainerInfo, error) {
	if err := ensureClient(); err != nil {
		return nil, err
	}
	ctx, cancel := withTimeout(context.Background(), 10*time.Second)
	defer cancel()
	containers, err := cli.ContainerList(ctx, container.ListOptions{All: true})
	if err != nil {
		return nil, err
	}

	aliases := db.GetAliases()
	settings := db.GetSettings()
	enriched := make([]models.ContainerInfo, 0, len(containers))

	for _, c := range containers {
		name := "unknown"
		if len(c.Names) > 0 {
			name = strings.TrimPrefix(c.Names[0], "/")
		}

		info := models.ContainerInfo{
			ID:          c.ID,
			ShortID:     c.ID[:12],
			Name:        name,
			Image:       c.Image,
			Status:      c.State,
			Created:     c.Created,
			IsPublished: len(c.Ports) > 0,
			Project:     c.Labels["com.docker.compose.project"],
			Ports:       []models.PublishedPort{},
		}

		// Parse health
		info.Health = "none"
		// The API types might vary, but usually health is in Status or inspected.
		// For list, we might need to inspect if we want detailed health, but let's try to parse from Status string first
		if strings.Contains(c.Status, "(healthy)") {
			info.Health = "healthy"
		} else if strings.Contains(c.Status, "(unhealthy)") {
			info.Health = "unhealthy"
		} else if strings.Contains(c.Status, "(starting)") {
			info.Health = "starting"
		}

		// Parse ports
		for _, p := range c.Ports {
			if p.PublicPort > 0 {
				info.Ports = append(info.Ports, models.PublishedPort{
					PrivatePort: int(p.PrivatePort),
					PublicPort:  int(p.PublicPort),
					Type:        p.Type,
					Host:        p.IP,
				})
			}
		}

		// Apply alias
		if alias, ok := aliases[c.ID]; ok {
			info.Alias = alias.Alias
			info.DisplayName = alias.Alias
			info.PrimaryPort = alias.PrimaryPort
			info.Protocol = alias.Protocol
		} else {
			info.DisplayName = name
		}

		// Generate access links
		info.AccessLinks = generateAccessLinks(info, settings)

		enriched = append(enriched, info)
	}

	return enriched, nil
}

func generateAccessLinks(info models.ContainerInfo, settings models.Settings) []models.AccessLink {
	links := []models.AccessLink{}
	if len(info.Ports) == 0 {
		return links
	}

	// Determine port to use
	port := info.Ports[0].PublicPort
	if info.PrimaryPort > 0 {
		for _, p := range info.Ports {
			if p.PublicPort == info.PrimaryPort {
				port = p.PublicPort
				break
			}
		}
	}

	protocol := settings.DefaultProtocol
	if info.Protocol != "" {
		protocol = info.Protocol
	}
	if protocol == "" {
		protocol = "http"
	}

	if settings.LocalNetworkIP != "" {
		links = append(links, models.AccessLink{
			Label: "Local",
			URL:   fmt.Sprintf("%s://%s:%d", protocol, settings.LocalNetworkIP, port),
			Type:  "local",
		})
	}

	if settings.TailscaleIP != "" {
		links = append(links, models.AccessLink{
			Label: "Tailscale",
			URL:   fmt.Sprintf("%s://%s:%d", protocol, settings.TailscaleIP, port),
			Type:  "tailscale",
		})
	}

	if settings.Domain != "" {
		links = append(links, models.AccessLink{
			Label: "Domain",
			URL:   fmt.Sprintf("%s://%s:%d", protocol, settings.Domain, port),
			Type:  "domain",
		})
	}

	return links
}

func GetStats() (models.StatsResponse, error) {
	containers, err := GetRunningContainers()
	if err != nil {
		return models.StatsResponse{}, err
	}

	stats := models.StatsResponse{
		TotalContainers: len(containers),
	}

	for _, c := range containers {
		if c.Status == "running" {
			stats.Running++
		} else {
			stats.Stopped++
		}
		switch c.Health {
		case "healthy":
			stats.Healthy++
		case "starting":
			stats.Starting++
		case "unhealthy":
			stats.Unhealthy++
		}
		if c.IsPublished {
			stats.PublishedServices++
		}
	}

	return stats, nil
}

func StartContainer(id string) error {
	if err := ensureClient(); err != nil {
		return err
	}
	ctx, cancel := withTimeout(context.Background(), 30*time.Second)
	defer cancel()
	return cli.ContainerStart(ctx, id, container.StartOptions{})
}

func StopContainer(id string) error {
	if err := ensureClient(); err != nil {
		return err
	}
	ctx, cancel := withTimeout(context.Background(), 30*time.Second)
	defer cancel()
	// A timeout of 10 seconds is the default used by the CLI.
	timeout := 10
	return cli.ContainerStop(ctx, id, container.StopOptions{Timeout: &timeout})
}

func RestartContainer(id string) error {
	if err := ensureClient(); err != nil {
		return err
	}
	ctx, cancel := withTimeout(context.Background(), 30*time.Second)
	defer cancel()
	timeout := 10
	return cli.ContainerRestart(ctx, id, container.StopOptions{Timeout: &timeout})
}

// ProjectAction performs start/stop/restart on all containers in a compose project.
func ProjectAction(projectName string, action string) (int, error) {
	if err := ensureClient(); err != nil {
		return 0, err
	}
	listCtx, listCancel := withTimeout(context.Background(), 10*time.Second)
	defer listCancel()
	containers, err := cli.ContainerList(listCtx, container.ListOptions{All: true})
	if err != nil {
		return 0, err
	}

	affected := 0
	timeout := 10
	for _, c := range containers {
		if c.Labels["com.docker.compose.project"] != projectName {
			continue
		}
		actCtx, actCancel := withTimeout(context.Background(), 30*time.Second)
		var actionErr error
		switch action {
		case "start":
			actionErr = cli.ContainerStart(actCtx, c.ID, container.StartOptions{})
		case "stop":
			actionErr = cli.ContainerStop(actCtx, c.ID, container.StopOptions{Timeout: &timeout})
		case "restart":
			actionErr = cli.ContainerRestart(actCtx, c.ID, container.StopOptions{Timeout: &timeout})
		}
		actCancel()
		if actionErr != nil {
			return affected, fmt.Errorf("failed to %s container %s: %w", action, c.ID[:12], actionErr)
		}
		affected++
	}
	return affected, nil
}

// GetDockerClient exposes the Docker client for the updater package.
func GetDockerClient() *client.Client {
	return cli
}
