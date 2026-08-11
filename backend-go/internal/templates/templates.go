package templates

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf16"

	"docker-dashboard/internal/models"
)

const (
	cacheTTL       = time.Hour
	maxBodySize    = 32 << 20
	maxComposeSize = 2 << 20
)

var client = &http.Client{Timeout: 15 * time.Second}

type cacheEntry struct {
	items     []models.TemplateItem
	fetchedAt time.Time
}

var sourceCache = struct {
	sync.RWMutex
	items map[string]cacheEntry
}{items: make(map[string]cacheEntry)}

var (
	markdownURL = regexp.MustCompile(`\[[^\]]+\]\((https?://[^)]+)\)`)
	htmlURL     = regexp.MustCompile(`(?i)<a\s+[^>]*href=["'](https?://[^"']+)["']`)
	plainURL    = regexp.MustCompile(`https?://[^\s<>"')]+`)
	githubRepo  = regexp.MustCompile(`github\.com/([^/]+/[^/#]+)`)
	nonSlug     = regexp.MustCompile(`[^a-z0-9-]`)
	multiDash   = regexp.MustCompile(`-+`)
)

func FetchAll(ctx context.Context, sources []models.TemplateSource) []models.TemplateItem {
	type result struct {
		index int
		items []models.TemplateItem
	}

	enabled := make([]models.TemplateSource, 0, len(sources))
	for _, source := range sources {
		if source.Enabled {
			enabled = append(enabled, source)
		}
	}

	results := make(chan result, len(enabled))
	for i, source := range enabled {
		go func(index int, source models.TemplateSource) {
			items, err := fetchSource(ctx, source)
			if err != nil {
				log.Printf("[Templates] Failed to fetch %s: %v", source.Name, err)
			}
			results <- result{index: index, items: items}
		}(i, source)
	}

	ordered := make([][]models.TemplateItem, len(enabled))
	for range enabled {
		result := <-results
		ordered[result.index] = result.items
	}

	var items []models.TemplateItem
	for _, sourceItems := range ordered {
		items = append(items, sourceItems...)
	}
	if items == nil {
		items = []models.TemplateItem{}
	}
	return items
}

func fetchSource(ctx context.Context, source models.TemplateSource) ([]models.TemplateItem, error) {
	sourceCache.RLock()
	cached, ok := sourceCache.items[source.URL]
	sourceCache.RUnlock()
	if ok && time.Since(cached.fetchedAt) < cacheTTL {
		return append([]models.TemplateItem(nil), cached.items...), nil
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, source.URL, nil)
	if err != nil {
		return cached.items, err
	}
	req.Header.Set("Accept", "application/json")

	response, err := client.Do(req)
	if err != nil {
		return append([]models.TemplateItem(nil), cached.items...), err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return append([]models.TemplateItem(nil), cached.items...), fmt.Errorf("HTTP %d", response.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(response.Body, maxBodySize+1))
	if err != nil {
		return append([]models.TemplateItem(nil), cached.items...), err
	}
	if len(body) > maxBodySize {
		return append([]models.TemplateItem(nil), cached.items...), fmt.Errorf("catalog is larger than %d MB", maxBodySize>>20)
	}

	var root any
	if err := json.Unmarshal(body, &root); err != nil {
		return append([]models.TemplateItem(nil), cached.items...), err
	}

	var items []models.TemplateItem
	if source.SourceID == "linuxserver" || strings.Contains(source.URL, "fleet.linuxserver.io") {
		for _, raw := range rootEntries(root, "images") {
			if item, ok := normalizeLinuxServer(raw); ok {
				items = append(items, item)
			}
		}
	} else {
		for _, raw := range rootEntries(root, "templates") {
			if item, ok := normalizePortainer(raw, source.Name); ok {
				items = append(items, item)
			}
		}
	}

	sourceCache.Lock()
	sourceCache.items[source.URL] = cacheEntry{items: items, fetchedAt: time.Now()}
	sourceCache.Unlock()
	return append([]models.TemplateItem(nil), items...), nil
}

func rootEntries(root any, key string) []any {
	if entries, ok := root.([]any); ok {
		return entries
	}
	if object, ok := root.(map[string]any); ok {
		if entries, ok := object[key].([]any); ok {
			return entries
		}
	}
	return nil
}

func normalizePortainer(raw any, sourceName string) (models.TemplateItem, bool) {
	entry, ok := raw.(map[string]any)
	if !ok {
		return models.TemplateItem{}, false
	}

	title := firstString(entry, "title", "name")
	if title == "" || intValue(entry["type"]) == 2 {
		return models.TemplateItem{}, false
	}

	description := stringValue(entry["description"])
	note := stringValue(entry["note"])
	item := models.TemplateItem{
		ID:          hashID(sourceName, title),
		Type:        "container",
		Title:       title,
		Description: description,
		Logo:        stringValue(entry["logo"]),
		Categories:  stringSlice(entry["categories"]),
		Source:      sourceName,
		Note:        note,
		ProjectURL:  resolveProjectURL(entry, description, note),
	}

	if intValue(entry["type"]) == 3 {
		if repository, ok := entry["repository"].(map[string]any); ok {
			item.Type = "stack"
			item.Repository = &models.TemplateRepository{
				URL:       stringValue(repository["url"]),
				Stackfile: stringValue(repository["stackfile"]),
			}
			return item, true
		}
	}

	item.Image = stringValue(entry["image"])
	item.Ports = stringSlice(entry["ports"])
	item.RestartPolicy = stringValue(entry["restart_policy"])
	if item.RestartPolicy == "" {
		item.RestartPolicy = "unless-stopped"
	}
	item.Network = stringValue(entry["network"])

	if volumes, ok := entry["volumes"].([]any); ok {
		for _, rawVolume := range volumes {
			volume, ok := rawVolume.(map[string]any)
			if !ok {
				continue
			}
			item.Volumes = append(item.Volumes, models.TemplateVolume{
				Bind:      stringValue(volume["bind"]),
				Container: stringValue(volume["container"]),
			})
		}
	}

	if variables, ok := entry["env"].([]any); ok {
		for _, rawVariable := range variables {
			variable, ok := rawVariable.(map[string]any)
			if !ok {
				continue
			}
			name := stringValue(variable["name"])
			value := stringValue(variable["default"])
			if value == "" {
				value = stringValue(variable["set"])
			}
			item.Env = append(item.Env, models.TemplateEnv{
				Name: name, Label: firstString(variable, "label", "name"), Default: value,
			})
		}
	}

	return item, true
}

func normalizeLinuxServer(raw any) (models.TemplateItem, bool) {
	entry, ok := raw.(map[string]any)
	if !ok || boolValue(entry["deprecated"]) {
		return models.TemplateItem{}, false
	}
	name := stringValue(entry["name"])
	if name == "" {
		return models.TemplateItem{}, false
	}
	description := stringValue(entry["description"])
	projectURL := stringValue(entry["project_url"])
	if !isHTTPURL(projectURL) {
		projectURL = extractFirstURL(description)
	}
	if projectURL == "" {
		projectURL = "https://github.com/linuxserver/docker-" + name
	}
	return models.TemplateItem{
		ID:          hashID("LinuxServer.io", name),
		Type:        "container",
		Title:       name,
		Description: description,
		Logo:        stringValue(entry["project_logo"]),
		Categories:  splitCategories(stringValue(entry["category"])),
		Source:      "LinuxServer.io",
		Image:       "lscr.io/linuxserver/" + name + ":latest",
		Env: []models.TemplateEnv{
			{Name: "PUID", Label: "User ID", Default: "1000"},
			{Name: "PGID", Label: "Group ID", Default: "1000"},
			{Name: "TZ", Label: "Timezone", Default: "Etc/UTC"},
		},
		RestartPolicy: "unless-stopped",
		Stars:         int64Value(entry["stars"]),
		Pulls:         int64Value(entry["monthly_pulls"]),
		ProjectURL:    projectURL,
	}, true
}

func GenerateCompose(ctx context.Context, item models.TemplateItem) (string, error) {
	if item.Type == "stack" && item.Repository != nil {
		return fetchStackCompose(ctx, *item.Repository)
	}

	name := Slug(item.Title)
	if name == "" {
		name = "service"
	}
	lines := []string{"services:", "  " + name + ":"}
	if item.Image != "" {
		lines = append(lines, "    image: "+item.Image)
	}
	if item.RestartPolicy != "" {
		lines = append(lines, "    restart: "+item.RestartPolicy)
	}
	if item.Network != "" {
		lines = append(lines, "    network_mode: "+item.Network)
	}
	if len(item.Ports) > 0 && item.Network == "" {
		lines = append(lines, "    ports:")
		for _, port := range item.Ports {
			lines = append(lines, fmt.Sprintf("      - %q", port))
		}
	}
	if len(item.Volumes) > 0 {
		lines = append(lines, "    volumes:")
		for _, volume := range item.Volumes {
			lines = append(lines, "      - "+volume.Bind+":"+volume.Container)
		}
	}
	if len(item.Env) > 0 {
		lines = append(lines, "    environment:")
		for _, variable := range item.Env {
			lines = append(lines, "      - "+variable.Name+"="+variable.Default)
		}
	}
	return strings.Join(lines, "\n") + "\n", nil
}

func fetchStackCompose(ctx context.Context, repository models.TemplateRepository) (string, error) {
	if match := githubRepo.FindStringSubmatch(repository.URL); len(match) == 2 {
		repo := strings.TrimSuffix(match[1], ".git")
		for _, branch := range []string{"main", "master"} {
			rawURL := fmt.Sprintf("https://raw.githubusercontent.com/%s/%s/%s", repo, branch, strings.TrimPrefix(repository.Stackfile, "/"))
			if compose, err := fetchText(ctx, rawURL); err == nil {
				return compose, nil
			}
		}
	}

	directURL := strings.TrimSuffix(repository.URL, "/") + "/" + strings.TrimPrefix(repository.Stackfile, "/")
	return fetchText(ctx, directURL)
}

func fetchText(ctx context.Context, sourceURL string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, sourceURL, nil)
	if err != nil {
		return "", err
	}
	response, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return "", fmt.Errorf("failed to fetch compose file: HTTP %d", response.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, maxComposeSize+1))
	if err != nil {
		return "", err
	}
	if len(body) > maxComposeSize {
		return "", fmt.Errorf("compose file is larger than %d MB", maxComposeSize>>20)
	}
	return string(body), nil
}

func Slug(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = nonSlug.ReplaceAllString(value, "-")
	value = multiDash.ReplaceAllString(value, "-")
	return strings.Trim(value, "-")
}

func hashID(source, title string) string {
	var hash int32
	for _, code := range utf16.Encode([]rune(source + ":" + title)) {
		hash = hash*31 + int32(code)
	}
	value := int64(hash)
	if value < 0 {
		value = -value
	}
	return strconv.FormatInt(value, 36)
}

func resolveProjectURL(entry map[string]any, description, note string) string {
	if value := extractFirstURL(description); value != "" {
		return value
	}
	if value := extractFirstURL(note); value != "" {
		return value
	}
	if value := stringValue(entry["maintainer"]); isHTTPURL(value) {
		return value
	}
	if repository, ok := entry["repository"].(map[string]any); ok {
		if value := stringValue(repository["url"]); isHTTPURL(value) {
			return value
		}
	}
	return ""
}

func extractFirstURL(value string) string {
	for _, pattern := range []*regexp.Regexp{markdownURL, htmlURL, plainURL} {
		match := pattern.FindStringSubmatch(value)
		if len(match) > 1 {
			return match[1]
		}
		if len(match) == 1 {
			return match[0]
		}
	}
	return ""
}

func isHTTPURL(value string) bool {
	value = strings.ToLower(strings.TrimSpace(value))
	return strings.HasPrefix(value, "http://") || strings.HasPrefix(value, "https://")
}

func firstString(values map[string]any, keys ...string) string {
	for _, key := range keys {
		if value := stringValue(values[key]); value != "" {
			return value
		}
	}
	return ""
}

func stringValue(value any) string {
	switch value := value.(type) {
	case string:
		return value
	case float64:
		return strconv.FormatFloat(value, 'f', -1, 64)
	case json.Number:
		return value.String()
	case bool:
		return strconv.FormatBool(value)
	default:
		return ""
	}
}

func stringSlice(value any) []string {
	items, ok := value.([]any)
	if !ok {
		return []string{}
	}
	result := make([]string, 0, len(items))
	for _, item := range items {
		if value := stringValue(item); value != "" {
			result = append(result, value)
		}
	}
	return result
}

func splitCategories(value string) []string {
	if value == "" {
		return []string{}
	}
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		if part = strings.TrimSpace(part); part != "" {
			result = append(result, part)
		}
	}
	return result
}

func intValue(value any) int {
	return int(int64Value(value))
}

func int64Value(value any) int64 {
	switch value := value.(type) {
	case float64:
		return int64(value)
	case string:
		parsed, _ := strconv.ParseInt(value, 10, 64)
		return parsed
	default:
		return 0
	}
}

func boolValue(value any) bool {
	switch value := value.(type) {
	case bool:
		return value
	case string:
		parsed, _ := strconv.ParseBool(value)
		return parsed
	default:
		return false
	}
}
