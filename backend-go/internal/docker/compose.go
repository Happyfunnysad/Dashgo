package docker

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

const maxComposeOutput = 64 << 10

var composeProjectName = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]*$`)

// DeployComposeStack stores the editable compose file and starts it with the
// bundled Docker Compose binary.
func DeployComposeStack(name, compose string) (string, error) {
	if err := ensureClient(); err != nil {
		return "", err
	}
	name = strings.TrimSpace(name)
	if !composeProjectName.MatchString(name) {
		return "", fmt.Errorf("stack name must contain only lowercase letters, numbers, dashes, and underscores")
	}
	if strings.TrimSpace(compose) == "" {
		return "", fmt.Errorf("compose content is required")
	}
	if len(compose) > 2<<20 {
		return "", fmt.Errorf("compose content is larger than 2 MB")
	}

	stacksDir := os.Getenv("STACKS_DIR")
	if stacksDir == "" {
		stacksDir = "data/stacks"
	}
	stackDir, err := filepath.Abs(filepath.Join(stacksDir, name))
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(stackDir, 0700); err != nil {
		return "", fmt.Errorf("create stack directory: %w", err)
	}

	composePath := filepath.Join(stackDir, "compose.yaml")
	if err := writeComposeFile(composePath, compose); err != nil {
		return "", err
	}

	command, args, err := composeCommand(composePath, name)
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancel()

	cmd := exec.CommandContext(ctx, command, args...)
	cmd.Dir = stackDir
	output, runErr := cmd.CombinedOutput()
	message := strings.TrimSpace(string(output))
	if len(message) > maxComposeOutput {
		message = message[len(message)-maxComposeOutput:]
	}
	if ctx.Err() == context.DeadlineExceeded {
		return message, fmt.Errorf("docker compose timed out after 15 minutes")
	}
	if runErr != nil {
		if message == "" {
			message = runErr.Error()
		}
		return message, fmt.Errorf("docker compose failed: %s", message)
	}
	return message, nil
}

func composeCommand(composePath, name string) (string, []string, error) {
	if binary, err := exec.LookPath("docker-compose"); err == nil {
		return binary, []string{"-f", composePath, "-p", name, "up", "-d"}, nil
	}
	if binary, err := exec.LookPath("docker"); err == nil {
		return binary, []string{"compose", "-f", composePath, "-p", name, "up", "-d"}, nil
	}
	return "", nil, fmt.Errorf("Docker Compose is not installed")
}

func writeComposeFile(path, content string) error {
	tmp, err := os.CreateTemp(filepath.Dir(path), ".compose-*.tmp")
	if err != nil {
		return fmt.Errorf("create compose file: %w", err)
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	if err := tmp.Chmod(0600); err != nil {
		tmp.Close()
		return err
	}
	if _, err := tmp.WriteString(content); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmpPath, path); err != nil {
		return fmt.Errorf("save compose file: %w", err)
	}
	return nil
}
