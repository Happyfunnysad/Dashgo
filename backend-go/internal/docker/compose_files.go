package docker

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/docker/docker/api/types/container"
	"gopkg.in/yaml.v3"
)

const (
	composeProjectLabel     = "com.docker.compose.project"
	composeWorkingDirLabel  = "com.docker.compose.project.working_dir"
	composeConfigFilesLabel = "com.docker.compose.project.config_files"
	maxComposeFileSize      = 2 << 20
)

type ComposeFileInfo struct {
	Index    int    `json:"index"`
	Name     string `json:"name"`
	Path     string `json:"path"`
	Readable bool   `json:"readable"`
	Editable bool   `json:"editable"`
	Error    string `json:"error,omitempty"`
}

type ComposeContainerInfo struct {
	Name  string `json:"name"`
	State string `json:"state"`
}

type ComposeProjectInfo struct {
	Name         string                 `json:"name"`
	WorkingDir   string                 `json:"workingDir"`
	Files        []ComposeFileInfo      `json:"files"`
	Containers   []ComposeContainerInfo `json:"containers"`
	RunningCount int                    `json:"runningCount"`
}

type ComposeDocument struct {
	Project ComposeProjectInfo `json:"project"`
	File    ComposeFileInfo    `json:"file"`
	Content string             `json:"content"`
}

type composeProjectDraft struct {
	name         string
	workingDir   string
	configPaths  []string
	containers   []ComposeContainerInfo
	runningCount int
}

// ListComposeProjects finds the Compose projects behind the current Docker
// containers. File locations come from labels written by Docker Compose.
func ListComposeProjects() ([]ComposeProjectInfo, error) {
	if err := ensureClient(); err != nil {
		return nil, err
	}
	ctx, cancel := withTimeout(context.Background(), 10*time.Second)
	defer cancel()

	containers, err := cli.ContainerList(ctx, container.ListOptions{All: true})
	if err != nil {
		return nil, err
	}

	drafts := make(map[string]*composeProjectDraft)
	for _, item := range containers {
		projectName := strings.TrimSpace(item.Labels[composeProjectLabel])
		if projectName == "" {
			continue
		}
		draft := drafts[projectName]
		if draft == nil {
			draft = &composeProjectDraft{name: projectName}
			drafts[projectName] = draft
		}

		if draft.workingDir == "" {
			draft.workingDir = strings.TrimSpace(item.Labels[composeWorkingDirLabel])
		}
		for _, path := range splitComposeConfigFiles(item.Labels[composeConfigFilesLabel]) {
			draft.configPaths = appendUniqueString(draft.configPaths, normalizeComposePath(draft.workingDir, path))
		}

		containerName := "unknown"
		if len(item.Names) > 0 {
			containerName = strings.TrimPrefix(item.Names[0], "/")
		}
		draft.containers = append(draft.containers, ComposeContainerInfo{Name: containerName, State: item.State})
		if item.State == "running" {
			draft.runningCount++
		}
	}

	projects := make([]ComposeProjectInfo, 0, len(drafts))
	for _, draft := range drafts {
		paths := draft.configPaths
		if len(paths) == 0 && draft.workingDir != "" {
			paths = discoverDefaultComposeFiles(draft.workingDir)
		}

		files := make([]ComposeFileInfo, 0, len(paths))
		for index, path := range paths {
			file := ComposeFileInfo{Index: index, Name: filepath.Base(path), Path: path}
			resolved, resolveErr := resolveComposePath(path)
			if resolveErr != nil {
				file.Error = resolveErr.Error()
			} else {
				file.Readable = true
				if composeFileWritable(resolved) {
					file.Editable = true
				} else {
					file.Error = "Compose file is read-only"
				}
			}
			files = append(files, file)
		}

		sort.Slice(draft.containers, func(i, j int) bool {
			return draft.containers[i].Name < draft.containers[j].Name
		})
		projects = append(projects, ComposeProjectInfo{
			Name:         draft.name,
			WorkingDir:   draft.workingDir,
			Files:        files,
			Containers:   draft.containers,
			RunningCount: draft.runningCount,
		})
	}

	sort.Slice(projects, func(i, j int) bool { return projects[i].Name < projects[j].Name })
	return projects, nil
}

func ReadComposeProjectFile(projectName string, fileIndex int) (ComposeDocument, error) {
	project, file, resolved, err := findComposeProjectFile(projectName, fileIndex)
	if err != nil {
		return ComposeDocument{}, err
	}

	handle, err := os.Open(resolved)
	if err != nil {
		return ComposeDocument{}, fmt.Errorf("open compose file: %w", err)
	}
	defer handle.Close()

	content, err := io.ReadAll(io.LimitReader(handle, maxComposeFileSize+1))
	if err != nil {
		return ComposeDocument{}, fmt.Errorf("read compose file: %w", err)
	}
	if len(content) > maxComposeFileSize {
		return ComposeDocument{}, fmt.Errorf("compose file is larger than 2 MB")
	}

	return ComposeDocument{Project: project, File: file, Content: string(content)}, nil
}

func SaveComposeProjectFile(projectName string, fileIndex int, content string) (ComposeDocument, error) {
	if strings.TrimSpace(content) == "" {
		return ComposeDocument{}, fmt.Errorf("compose content is required")
	}
	if len(content) > maxComposeFileSize {
		return ComposeDocument{}, fmt.Errorf("compose file is larger than 2 MB")
	}
	if err := validateComposeYAML(content); err != nil {
		return ComposeDocument{}, err
	}

	project, file, resolved, err := findComposeProjectFile(projectName, fileIndex)
	if err != nil {
		return ComposeDocument{}, err
	}
	if !file.Editable {
		return ComposeDocument{}, fmt.Errorf("compose file is read-only")
	}
	if err := replaceComposeFile(resolved, content); err != nil {
		return ComposeDocument{}, err
	}

	return ComposeDocument{Project: project, File: file, Content: content}, nil
}

// ApplyComposeProject recreates changed services using every Compose file
// recorded for the current project.
func ApplyComposeProject(projectName string) (string, error) {
	if err := ensureClient(); err != nil {
		return "", err
	}
	if !composeProjectName.MatchString(projectName) {
		return "", fmt.Errorf("invalid Compose project name")
	}

	projects, err := ListComposeProjects()
	if err != nil {
		return "", err
	}
	var project *ComposeProjectInfo
	for index := range projects {
		if projects[index].Name == projectName {
			project = &projects[index]
			break
		}
	}
	if project == nil {
		return "", fmt.Errorf("compose project %q was not found", projectName)
	}
	if len(project.Files) == 0 {
		return "", fmt.Errorf("compose files were not found for project %q", projectName)
	}

	paths := make([]string, 0, len(project.Files))
	for _, file := range project.Files {
		if _, resolveErr := resolveComposePath(file.Path); resolveErr != nil {
			return "", resolveErr
		}
		if aliasErr := ensureHostPathAvailable(filepath.Dir(file.Path)); aliasErr != nil {
			return "", aliasErr
		}
		paths = append(paths, filepath.Clean(file.Path))
	}
	workingDir := strings.TrimSpace(project.WorkingDir)
	if workingDir == "" {
		workingDir = filepath.Dir(paths[0])
	}
	if err := ensureHostPathAvailable(workingDir); err != nil {
		return "", err
	}

	command, args, err := composeApplyCommand(paths, projectName, workingDir)
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancel()

	cmd := exec.CommandContext(ctx, command, args...)
	cmd.Dir = workingDir
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

func composeApplyCommand(paths []string, projectName, workingDir string) (string, []string, error) {
	args := make([]string, 0, len(paths)*2+6)
	for _, path := range paths {
		args = append(args, "-f", path)
	}
	args = append(args, "--project-directory", workingDir, "-p", projectName, "up", "-d")

	if binary, err := exec.LookPath("docker-compose"); err == nil {
		return binary, args, nil
	}
	if binary, err := exec.LookPath("docker"); err == nil {
		return binary, append([]string{"compose"}, args...), nil
	}
	return "", nil, fmt.Errorf("Docker Compose is not installed")
}

// ensureHostPathAvailable exposes a host directory at its original absolute
// path inside Dashgo. Compose must see that original path so relative bind
// mounts and build contexts keep pointing at the host, not at /host/....
func ensureHostPathAvailable(hostPath string) error {
	hostPath = filepath.Clean(hostPath)
	if !filepath.IsAbs(hostPath) {
		return fmt.Errorf("Compose working directory %q is not absolute", hostPath)
	}
	hostRoot := strings.TrimSpace(os.Getenv("HOST_ROOT"))
	if hostRoot == "" {
		if info, err := os.Stat(hostPath); err == nil && info.IsDir() {
			return nil
		}
		return fmt.Errorf("HOST_ROOT is not configured")
	}

	mappedPath := filepath.Join(filepath.Clean(hostRoot), strings.TrimPrefix(hostPath, string(filepath.Separator)))
	mappedInfo, mappedErr := os.Stat(mappedPath)
	if mappedErr != nil || !mappedInfo.IsDir() {
		if info, err := os.Stat(hostPath); err == nil && info.IsDir() {
			return nil
		}
		return fmt.Errorf("host directory %q is not available inside Dashgo", hostPath)
	}

	if originalInfo, err := os.Stat(hostPath); err == nil {
		if originalInfo.IsDir() && os.SameFile(originalInfo, mappedInfo) {
			return nil
		}
		return fmt.Errorf("cannot expose host directory %q because that path is already used inside Dashgo", hostPath)
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("check Compose working directory: %w", err)
	}

	aliasPath := hostPath
	for {
		parent := filepath.Dir(aliasPath)
		if parent == aliasPath {
			return fmt.Errorf("cannot expose host directory %q", hostPath)
		}
		if _, err := os.Lstat(parent); err == nil {
			break
		} else if !os.IsNotExist(err) {
			return fmt.Errorf("check Compose path parent: %w", err)
		}
		aliasPath = parent
	}

	aliasTarget := filepath.Join(filepath.Clean(hostRoot), strings.TrimPrefix(aliasPath, string(filepath.Separator)))
	if info, err := os.Stat(aliasTarget); err != nil || !info.IsDir() {
		return fmt.Errorf("host directory %q is not available inside Dashgo", aliasPath)
	}
	if err := os.Symlink(aliasTarget, aliasPath); err != nil && !os.IsExist(err) {
		return fmt.Errorf("expose host directory %q: %w", aliasPath, err)
	}
	if info, err := os.Stat(hostPath); err != nil || !info.IsDir() {
		return fmt.Errorf("failed to expose host directory %q", hostPath)
	}
	return nil
}

func findComposeProjectFile(projectName string, fileIndex int) (ComposeProjectInfo, ComposeFileInfo, string, error) {
	projects, err := ListComposeProjects()
	if err != nil {
		return ComposeProjectInfo{}, ComposeFileInfo{}, "", err
	}
	for _, project := range projects {
		if project.Name != projectName {
			continue
		}
		if fileIndex < 0 || fileIndex >= len(project.Files) {
			return ComposeProjectInfo{}, ComposeFileInfo{}, "", fmt.Errorf("compose file was not found for project %q", projectName)
		}
		file := project.Files[fileIndex]
		resolved, resolveErr := resolveComposePath(file.Path)
		if resolveErr != nil {
			return ComposeProjectInfo{}, ComposeFileInfo{}, "", resolveErr
		}
		return project, file, resolved, nil
	}
	return ComposeProjectInfo{}, ComposeFileInfo{}, "", fmt.Errorf("compose project %q was not found", projectName)
}

func splitComposeConfigFiles(value string) []string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

func normalizeComposePath(workingDir, path string) string {
	path = strings.TrimSpace(path)
	if path == "" {
		return ""
	}
	if filepath.IsAbs(path) {
		return filepath.Clean(path)
	}
	if workingDir != "" {
		return filepath.Clean(filepath.Join(workingDir, path))
	}
	return filepath.Clean(path)
}

func discoverDefaultComposeFiles(workingDir string) []string {
	for _, name := range []string{"compose.yaml", "compose.yml", "docker-compose.yml", "docker-compose.yaml"} {
		path := normalizeComposePath(workingDir, name)
		if _, err := resolveComposePath(path); err == nil {
			return []string{path}
		}
	}
	return nil
}

func resolveComposePath(path string) (string, error) {
	cleaned := filepath.Clean(path)
	if !filepath.IsAbs(cleaned) {
		return "", fmt.Errorf("compose path %q is not absolute", path)
	}

	candidates := make([]string, 0, 2)
	if hostRoot := strings.TrimSpace(os.Getenv("HOST_ROOT")); hostRoot != "" {
		candidates = append(candidates, filepath.Join(filepath.Clean(hostRoot), strings.TrimPrefix(cleaned, string(filepath.Separator))))
	}
	candidates = append(candidates, cleaned)

	for _, candidate := range candidates {
		info, err := os.Stat(candidate)
		if err == nil && info.Mode().IsRegular() {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("compose file %q is not available inside Dashgo", path)
}

func composeFileWritable(path string) bool {
	handle, err := os.OpenFile(path, os.O_WRONLY, 0)
	if err != nil {
		return false
	}
	return handle.Close() == nil
}

func validateComposeYAML(content string) error {
	var document yaml.Node
	if err := yaml.Unmarshal([]byte(content), &document); err != nil {
		return fmt.Errorf("invalid YAML: %w", err)
	}
	if len(document.Content) == 0 || document.Content[0].Kind != yaml.MappingNode {
		return fmt.Errorf("compose file must contain a YAML object")
	}
	return nil
}

func replaceComposeFile(path, content string) error {
	info, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("stat compose file: %w", err)
	}

	temporary, err := os.CreateTemp(filepath.Dir(path), ".dashgo-compose-*.tmp")
	if err != nil {
		return fmt.Errorf("create temporary compose file: %w", err)
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)

	if err := temporary.Chmod(info.Mode().Perm()); err != nil {
		temporary.Close()
		return fmt.Errorf("preserve compose permissions: %w", err)
	}
	if stat, ok := info.Sys().(*syscall.Stat_t); ok {
		_ = os.Chown(temporaryPath, int(stat.Uid), int(stat.Gid))
	}
	if _, err := temporary.WriteString(content); err != nil {
		temporary.Close()
		return fmt.Errorf("write compose file: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		temporary.Close()
		return fmt.Errorf("sync compose file: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("close compose file: %w", err)
	}
	if err := os.Rename(temporaryPath, path); err != nil {
		return fmt.Errorf("replace compose file: %w", err)
	}
	return nil
}

func appendUniqueString(values []string, value string) []string {
	if value == "" {
		return values
	}
	for _, existing := range values {
		if existing == value {
			return values
		}
	}
	return append(values, value)
}

func ParseComposeFileIndex(value string) (int, error) {
	if value == "" {
		return 0, nil
	}
	index, err := strconv.Atoi(value)
	if err != nil || index < 0 {
		return 0, fmt.Errorf("invalid compose file index")
	}
	return index, nil
}
