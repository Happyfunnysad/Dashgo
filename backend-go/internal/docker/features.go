package docker

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"docker-dashboard/internal/db"
	"docker-dashboard/internal/models"
	"docker-dashboard/internal/utils"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/events"
	"github.com/docker/docker/pkg/stdcopy"
)

// webhookClient sends event notifications with a bounded timeout so an
// unreachable or slow endpoint cannot hang the event listener goroutine.
var webhookClient = &http.Client{Timeout: 10 * time.Second}

func GetContainerStats(id string) (*models.ContainerMetrics, error) {
	if err := ensureClient(); err != nil {
		return nil, err
	}
	stats, err := cli.ContainerStatsOneShot(context.Background(), id)
	if err != nil {
		return nil, err
	}
	defer stats.Body.Close()

	var v struct {
		MemoryStats struct {
			Usage uint64 `json:"usage"`
			Limit uint64 `json:"limit"`
		} `json:"memory_stats"`
		CPUStats struct {
			CPUUsage struct {
				TotalUsage  uint64   `json:"total_usage"`
				PercpuUsage []uint64 `json:"percpu_usage"`
			} `json:"cpu_usage"`
			SystemUsage uint64 `json:"system_cpu_usage"`
			OnlineCPUs  uint32 `json:"online_cpus"`
		} `json:"cpu_stats"`
		PreCPUStats struct {
			CPUUsage struct {
				TotalUsage uint64 `json:"total_usage"`
			} `json:"cpu_usage"`
			SystemUsage uint64 `json:"system_cpu_usage"`
		} `json:"precpu_stats"`
	}

	if err := json.NewDecoder(stats.Body).Decode(&v); err != nil {
		return nil, err
	}

	metrics := &models.ContainerMetrics{}
	metrics.MemoryUsageBytes = v.MemoryStats.Usage
	metrics.MemoryLimitBytes = v.MemoryStats.Limit
	if v.MemoryStats.Limit > 0 {
		metrics.MemoryPercentage = float64(v.MemoryStats.Usage) / float64(v.MemoryStats.Limit) * 100.0
	}

	cpuDelta := float64(v.CPUStats.CPUUsage.TotalUsage) - float64(v.PreCPUStats.CPUUsage.TotalUsage)
	systemDelta := float64(v.CPUStats.SystemUsage) - float64(v.PreCPUStats.SystemUsage)
	onlineCPUs := float64(v.CPUStats.OnlineCPUs)
	if onlineCPUs == 0.0 {
		onlineCPUs = float64(len(v.CPUStats.CPUUsage.PercpuUsage))
	}
	if systemDelta > 0.0 && cpuDelta > 0.0 {
		metrics.CPUPercentage = (cpuDelta / systemDelta) * onlineCPUs * 100.0
	}

	return metrics, nil
}

func GetContainerLogs(id string) (string, error) {
	if err := ensureClient(); err != nil {
		return "", err
	}
	c, err := cli.ContainerInspect(context.Background(), id)
	if err != nil {
		return "", err
	}

	options := container.LogsOptions{ShowStdout: true, ShowStderr: true, Tail: "500"}
	out, err := cli.ContainerLogs(context.Background(), id, options)
	if err != nil {
		return "", err
	}
	defer out.Close()

	var buf bytes.Buffer
	if c.Config.Tty {
		_, err = io.Copy(&buf, out)
	} else {
		_, err = stdcopy.StdCopy(&buf, &buf, out)
	}

	if err != nil && err != io.EOF {
		return "", err
	}
	return buf.String(), nil
}

// sensitiveEnvPatterns are substrings that, when found in an env var key,
// mark its value as secret and worthy of redaction in the inspect view.
var sensitiveEnvPatterns = []string{
	"password", "passwd", "pwd",
	"secret", "token", "apikey", "api_key",
	"key", "credential", "auth",
	"private", "access_key", "session",
	"dsn", "database_url", "conn",
}

func isSensitiveEnvKey(key string) bool {
	k := strings.ToLower(key)
	for _, p := range sensitiveEnvPatterns {
		if strings.Contains(k, p) {
			return true
		}
	}
	return false
}

func InspectContainer(id string) (*models.ContainerDetails, error) {
	if err := ensureClient(); err != nil {
		return nil, err
	}
	c, err := cli.ContainerInspect(context.Background(), id)
	if err != nil {
		return nil, err
	}

	details := &models.ContainerDetails{
		Env:      c.Config.Env,
		Networks: make([]string, 0),
		Mounts:   make([]models.Mount, 0),
	}

	for i, e := range details.Env {
		parts := strings.SplitN(e, "=", 2)
		if len(parts) == 2 && isSensitiveEnvKey(parts[0]) {
			details.Env[i] = parts[0] + "=********"
		}
	}

	for netName := range c.NetworkSettings.Networks {
		details.Networks = append(details.Networks, netName)
	}

	for _, m := range c.Mounts {
		details.Mounts = append(details.Mounts, models.Mount{
			Type:        string(m.Type),
			Source:      m.Source,
			Destination: m.Destination,
			Mode:        m.Mode,
			RW:          m.RW,
		})
	}

	return details, nil
}

func StartEventListener() {
	msgs, errs := cli.Events(context.Background(), events.ListOptions{})
	go func() {
		for {
			select {
			case err := <-errs:
				if err != nil && err != io.EOF {
					log.Printf("Docker event error: %v", err)
				}
				return
			case msg := <-msgs:
				if msg.Type == "container" && (msg.Action == "die" || msg.Action == "health_status: unhealthy") {
					settings := db.GetSettings()
					if settings.WebhookURL != "" {
						if err := utils.ValidateWebhookURL(settings.WebhookURL); err != nil {
							log.Printf("Skipping webhook: %v", err)
							continue
						}
						name := msg.Actor.Attributes["name"]
						payload := map[string]string{
							"text": fmt.Sprintf("⚠️ Docker Alert: Container **%s** status changed to `%s`", name, msg.Action),
						}
						payloadBytes, _ := json.Marshal(payload)
						resp, err := webhookClient.Post(settings.WebhookURL, "application/json", bytes.NewBuffer(payloadBytes))
						if err != nil {
							log.Printf("Webhook POST failed: %v", err)
							continue
						}
						resp.Body.Close()
					}
				}
			}
		}
	}()
}
