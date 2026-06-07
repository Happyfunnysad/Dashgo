package models

type ContainerInfo struct {
	ID          string          `json:"id"`
	ShortID     string          `json:"shortId"`
	Name        string          `json:"name"`
	Image       string          `json:"image"`
	Status      string          `json:"status"`
	Health      string          `json:"health"`
	Ports       []PublishedPort `json:"ports"`
	Created     int64           `json:"created"`
	IsPublished bool            `json:"isPublished"`
	Alias       string          `json:"alias"`
	DisplayName string          `json:"displayName"`
	PrimaryPort int             `json:"primaryPort"`
	Protocol    string          `json:"protocol"`
	AccessLinks []AccessLink    `json:"accessLinks"`
	Project     string          `json:"project"`
}

type PublishedPort struct {
	PrivatePort int    `json:"privatePort"`
	PublicPort  int    `json:"publicPort"`
	Type        string `json:"type"`
	Host        string `json:"host"`
}

type AccessLink struct {
	Label string `json:"label"`
	URL   string `json:"url"`
	Type  string `json:"type"`
}

type Settings struct {
	LocalNetworkIP        string `json:"localNetworkIp"`
	TailscaleIP           string `json:"tailscaleIp"`
	TailscaleHostname     string `json:"tailscaleHostname"`
	Domain                string `json:"domain"`
	DefaultProtocol       string `json:"defaultProtocol"`
	AutoRefreshInterval   int    `json:"autoRefreshInterval"`
	WebhookURL            string `json:"webhookUrl"`
}

type Alias struct {
	ContainerID   string `json:"containerId"`
	ContainerName string `json:"containerName"`
	Alias         string `json:"alias"`
	PrimaryPort   int    `json:"primaryPort"`
	Protocol      string `json:"protocol"`
}

type StatsResponse struct {
	TotalContainers   int `json:"totalContainers"`
	Running           int `json:"running"`
	Healthy           int `json:"healthy"`
	Starting          int `json:"starting"`
	Unhealthy         int `json:"unhealthy"`
	PublishedServices int `json:"publishedServices"`
}

type ContainerMetrics struct {
	CPUPercentage    float64 `json:"cpuPercentage"`
	MemoryUsageBytes uint64  `json:"memoryUsageBytes"`
	MemoryLimitBytes uint64  `json:"memoryLimitBytes"`
	MemoryPercentage float64 `json:"memoryPercentage"`
}

type ContainerDetails struct {
	Env      []string `json:"env"`
	Mounts   []Mount  `json:"mounts"`
	Networks []string `json:"networks"`
}

type Mount struct {
	Type        string `json:"type"`
	Source      string `json:"source"`
	Destination string `json:"destination"`
	Mode        string `json:"mode"`
	RW          bool   `json:"rw"`
}

type ThermalZone struct {
	Zone        string  `json:"zone"`
	Label       string  `json:"label"`
	Temperature float64 `json:"temperature"`
}

type HardwareStats struct {
	// CPU
	CPUCores        int     `json:"cpuCores"`
	CPUUsagePercent float64 `json:"cpuUsagePercent"`
	LoadAvg1        float64 `json:"loadAvg1"`
	LoadAvg5        float64 `json:"loadAvg5"`
	LoadAvg15       float64 `json:"loadAvg15"`

	// Memory
	MemoryTotalBytes     uint64  `json:"memoryTotalBytes"`
	MemoryUsedBytes      uint64  `json:"memoryUsedBytes"`
	MemoryAvailableBytes uint64  `json:"memoryAvailableBytes"`
	MemoryUsagePercent   float64 `json:"memoryUsagePercent"`

	// Disk
	DiskTotalBytes   uint64  `json:"diskTotalBytes"`
	DiskUsedBytes    uint64  `json:"diskUsedBytes"`
	DiskFreeBytes    uint64  `json:"diskFreeBytes"`
	DiskUsagePercent float64 `json:"diskUsagePercent"`

	// Temperature
	CPUTempCelsius float64       `json:"cpuTempCelsius"`
	Temperatures   []ThermalZone `json:"temperatures"`

	// System
	Hostname       string  `json:"hostname"`
	KernelVersion  string  `json:"kernelVersion"`
	UptimeSeconds  float64 `json:"uptimeSeconds"`
	UptimeFormatted string `json:"uptimeFormatted"`
}

type ImageUpdateStatus struct {
	ContainerID   string `json:"containerId"`
	ContainerName string `json:"containerName"`
	Image         string `json:"image"`
	CurrentDigest string `json:"currentDigest"`
	LatestDigest  string `json:"latestDigest"`
	UpdateAvail   bool   `json:"updateAvailable"`
	CheckedAt     int64  `json:"checkedAt"`
}

