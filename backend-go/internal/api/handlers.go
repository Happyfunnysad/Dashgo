package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os/exec"
	"strings"
	"time"

	"docker-dashboard/internal/auth"
	"docker-dashboard/internal/db"
	"docker-dashboard/internal/docker"
	"docker-dashboard/internal/models"
	"docker-dashboard/internal/sys"
	"docker-dashboard/internal/updater"
	"docker-dashboard/internal/utils"

	"github.com/gin-gonic/gin"
)

var httpClient = &http.Client{
	Timeout: 10 * time.Second,
}

func RegisterRoutes(r *gin.Engine) {
	// Load saved password hash into auth package
	if hash := db.GetPasswordHash(); hash != "" {
		auth.SetPasswordHash(hash)
	}

	// Start session cleanup goroutine
	go func() {
		for range time.NewTicker(10 * time.Minute).C {
			auth.CleanExpired()
		}
	}()

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	api := r.Group("/api")

	// --- Public auth endpoints (no middleware) ---
	api.GET("/auth/status", getAuthStatus)
	api.POST("/auth/login", loginHandler)
	api.POST("/auth/setup", setupPasswordHandler)

	// --- Protected endpoints ---
	api.Use(authMiddleware())
	{
		api.POST("/auth/logout", logoutHandler)
		api.POST("/auth/change-password", changePasswordHandler)

		api.GET("/containers", getContainers)
		api.POST("/containers/:id/start", startContainer)
		api.POST("/containers/:id/stop", stopContainer)
		api.POST("/containers/:id/restart", restartContainer)

		api.GET("/stats", getStats)
		api.GET("/settings", getSettings)
		api.PUT("/settings", updateSettings)
		api.GET("/aliases", getAliases)
		api.PUT("/aliases/:containerId", upsertAlias)
		api.DELETE("/aliases/:containerId", deleteAlias)
		api.GET("/containers/:id/stats", getContainerStats)
		api.GET("/containers/:id/logs", getContainerLogs)
		api.GET("/containers/:id/inspect", inspectContainer)
		api.GET("/tailscale/status", getTailscaleStatus)
		api.POST("/tailscale/auth", authTailscale)
		api.DELETE("/tailscale/devices/:deviceId", deleteTailscaleDevice)

		// Hardware monitoring
		api.GET("/hardware", getHardwareStats)

		// Project (Stack) actions
		api.POST("/projects/:name/start", projectAction("start"))
		api.POST("/projects/:name/stop", projectAction("stop"))
		api.POST("/projects/:name/restart", projectAction("restart"))

		// Update manager
		api.GET("/updates", getUpdateStatuses)
		api.POST("/updates/check", triggerUpdateCheck)
	}
}

// authMiddleware protects endpoints. Until a password is configured, all
// protected endpoints are denied (the UI only needs the public /auth/* routes
// for first-run setup). This prevents an unauthenticated window where the
// Docker-controlling API is exposed before a password is set.
func authMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !auth.IsConfigured() {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Setup required: configure an admin password first"})
			c.Abort()
			return
		}

		// Check Authorization header: "Bearer <token>"
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization required"})
			c.Abort()
			return
		}

		token := strings.TrimPrefix(authHeader, "Bearer ")
		if token == authHeader {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authorization format"})
			c.Abort()
			return
		}

		if !auth.ValidateToken(token) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired token"})
			c.Abort()
			return
		}

		c.Next()
	}
}

func getContainers(c *gin.Context) {
	containers, err := docker.GetRunningContainers()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, containers)
}

func getStats(c *gin.Context) {
	stats, err := docker.GetStats()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, stats)
}

func getSettings(c *gin.Context) {
	c.JSON(http.StatusOK, db.GetSettings())
}

func updateSettings(c *gin.Context) {
	var settings models.Settings
	if err := c.ShouldBindJSON(&settings); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if settings.WebhookURL != "" {
		if err := utils.ValidateWebhookURL(settings.WebhookURL); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}
	updated, err := db.UpdateSettings(settings)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, updated)
}

func getAliases(c *gin.Context) {
	aliasesMap := db.GetAliases()
	aliases := make([]models.Alias, 0, len(aliasesMap))
	for _, v := range aliasesMap {
		aliases = append(aliases, v)
	}
	c.JSON(http.StatusOK, aliases)
}

func upsertAlias(c *gin.Context) {
	var alias models.Alias
	if err := c.ShouldBindJSON(&alias); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	alias.ContainerID = c.Param("containerId")
	updated, err := db.UpsertAlias(alias)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, updated)
}

func deleteAlias(c *gin.Context) {
	err := db.DeleteAlias(c.Param("containerId"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func getContainerStats(c *gin.Context) {
	id := c.Param("id")
	stats, err := docker.GetContainerStats(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, stats)
}

func getContainerLogs(c *gin.Context) {
	id := c.Param("id")
	logs, err := docker.GetContainerLogs(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"logs": logs})
}

func inspectContainer(c *gin.Context) {
	id := c.Param("id")
	details, err := docker.InspectContainer(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, details)
}

func deleteTailscaleDevice(c *gin.Context) {
	deviceID := c.Param("deviceId")
	apiKey := c.GetHeader("X-Tailscale-Api-Key")
	
	if apiKey == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Tailscale API Key is missing from headers"})
		return
	}

	req, err := http.NewRequest("DELETE", "https://api.tailscale.com/api/v2/device/"+url.PathEscape(deviceID), nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create request: " + err.Error()})
		return
	}
	req.SetBasicAuth(apiKey, "")

	resp, err := httpClient.Do(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to execute request: " + err.Error()})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		bodyBytes, readErr := io.ReadAll(resp.Body)
		if readErr != nil {
			c.JSON(resp.StatusCode, gin.H{"error": "Tailscale API returned error, and failed to read body"})
			return
		}
		c.JSON(resp.StatusCode, gin.H{"error": "Tailscale API returned error: " + string(bodyBytes)})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "success"})
}

func getTailscaleStatus(c *gin.Context) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "tailscale", "--socket=/run/tailscale/tailscaled.sock", "status", "--json")
	output, err := cmd.Output()
	if ctx.Err() == context.DeadlineExceeded {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Tailscale command timed out"})
		return
	}
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Tailscale not accessible: " + err.Error()})
		return
	}

	var result map[string]interface{}
	if err := json.Unmarshal(output, &result); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse tailscale output: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

func authTailscale(c *gin.Context) {
	var body struct {
		AuthKey string `json:"authKey" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "tailscale", "--socket=/run/tailscale/tailscaled.sock", "up", "--reset", "--authkey", body.AuthKey)
	output, err := cmd.CombinedOutput()
	if ctx.Err() == context.DeadlineExceeded {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Tailscale auth timed out"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Tailscale error: " + string(output)})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "success"})
}

func startContainer(c *gin.Context) {
	id := c.Param("id")
	if err := docker.StartContainer(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to start container: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "started"})
}

func stopContainer(c *gin.Context) {
	id := c.Param("id")
	if err := docker.StopContainer(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to stop container: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "stopped"})
}

func restartContainer(c *gin.Context) {
	id := c.Param("id")
	if err := docker.RestartContainer(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to restart container: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "restarted"})
}

// --- Hardware Monitoring ---

func getHardwareStats(c *gin.Context) {
	stats, err := sys.GetHardwareStats()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get hardware stats: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, stats)
}

// --- Project (Stack) Actions ---

func projectAction(action string) gin.HandlerFunc {
	return func(c *gin.Context) {
		name := c.Param("name")
		affected, err := docker.ProjectAction(name, action)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": action + "ed", "affected": affected})
	}
}

// --- Update Manager ---

func getUpdateStatuses(c *gin.Context) {
	statuses := updater.GetStatuses()
	c.JSON(http.StatusOK, statuses)
}

func triggerUpdateCheck(c *gin.Context) {
	statuses := updater.CheckNow()
	c.JSON(http.StatusOK, statuses)
}

// --- Auth Handlers ---

func getAuthStatus(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"configured": auth.IsConfigured(),
	})
}

func loginHandler(c *gin.Context) {
	var req struct {
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Password is required"})
		return
	}

	clientKey := c.ClientIP()
	if remaining := auth.LockRemaining(clientKey); remaining > 0 {
		c.JSON(http.StatusTooManyRequests, gin.H{
			"error": "Too many failed attempts. Try again in " + remaining.Round(time.Second).String(),
		})
		return
	}

	token, err := auth.Login(req.Password)
	if err != nil {
		status := http.StatusUnauthorized
		if err == auth.ErrNotConfigured {
			status = http.StatusPreconditionFailed
		} else {
			auth.RegisterFailedAttempt(clientKey)
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}

	auth.ResetAttempts(clientKey)
	c.JSON(http.StatusOK, gin.H{"token": token})
}

func setupPasswordHandler(c *gin.Context) {
	// Only allow setup if no password is configured yet
	if auth.IsConfigured() {
		c.JSON(http.StatusForbidden, gin.H{"error": "Password already configured. Use change-password endpoint."})
		return
	}

	var req struct {
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Password is required"})
		return
	}

	if len(req.Password) < auth.MinPasswordLength {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Password must be at least %d characters", auth.MinPasswordLength)})
		return
	}

	hash, err := auth.SetPassword(req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}

	// Persist hash to config file
	if err := db.SetPasswordHash(hash); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save password"})
		return
	}

	// Auto-login after setup
	token, _ := auth.Login(req.Password)
	c.JSON(http.StatusOK, gin.H{"token": token, "message": "Password configured successfully"})
}

func logoutHandler(c *gin.Context) {
	token := strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
	auth.Logout(token)
	c.JSON(http.StatusOK, gin.H{"message": "Logged out"})
}

func changePasswordHandler(c *gin.Context) {
	var req struct {
		CurrentPassword string `json:"currentPassword" binding:"required"`
		NewPassword     string `json:"newPassword" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Both currentPassword and newPassword are required"})
		return
	}

	if len(req.NewPassword) < auth.MinPasswordLength {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("New password must be at least %d characters", auth.MinPasswordLength)})
		return
	}

	// Verify current password
	if _, err := auth.Login(req.CurrentPassword); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Current password is incorrect"})
		return
	}

	hash, err := auth.SetPassword(req.NewPassword)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}

	if err := db.SetPasswordHash(hash); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save password"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Password changed successfully"})
}

