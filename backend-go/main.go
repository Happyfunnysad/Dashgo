package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"docker-dashboard/internal/api"
	"docker-dashboard/internal/db"
	"docker-dashboard/internal/docker"
	"docker-dashboard/internal/updater"

	"github.com/gin-gonic/gin"
)

//go:embed all:frontend/dist
var frontendFS embed.FS

func main() {
	// Initialize config
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "data/config.json"
	}
	if err := db.InitDB(dbPath); err != nil {
		log.Fatalf("Failed to initialize config: %v", err)
	}

	// Initialize Docker client
	if err := docker.InitClient(); err != nil {
		log.Printf("Warning: Failed to initialize Docker client (is Docker running?): %v", err)
	} else {
		docker.StartEventListener()
		// Start background update checker (every 4 hours)
		updater.Init(docker.GetDockerClient(), 4*time.Hour)
	}

	// Set Gin mode
	if os.Getenv("NODE_ENV") == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.Default()

	// Trust only explicitly configured proxies.
	// Default: trust no proxy (prevents X-Forwarded-For spoofing for brute-force bypass).
	// Set TRUSTED_PROXIES=<cidr1,cidr2,...> in env to override.
	trustedProxies := os.Getenv("TRUSTED_PROXIES")
	if trustedProxies != "" {
		if err := r.SetTrustedProxies(strings.Split(trustedProxies, ",")); err != nil {
			log.Fatalf("Invalid TRUSTED_PROXIES value: %v", err)
		}
	} else {
		_ = r.SetTrustedProxies(nil) // no proxy trusted by default
	}

	// CORS: only enable if an explicit allow-origin is configured.
	// The embedded frontend is same-origin so wildcard CORS is not needed and
	// would unnecessarily expose the Authorization header to any origin.
	if corsOrigin := os.Getenv("CORS_ORIGIN"); corsOrigin != "" {
		r.Use(func(c *gin.Context) {
			c.Writer.Header().Set("Access-Control-Allow-Origin", corsOrigin)
			c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Tailscale-Api-Key")
			if c.Request.Method == "OPTIONS" {
				c.AbortWithStatus(204)
				return
			}
			c.Next()
		})
	}

	// Register API routes
	api.RegisterRoutes(r)

	// Serve embedded frontend
	subFS, err := fs.Sub(frontendFS, "frontend/dist")
	if err != nil {
		log.Fatalf("Failed to create sub filesystem: %v", err)
	}

	// Serve static files and fallback to index.html
	r.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path
		
		// 1. Try to serve the exact file from the embedded FS
		// Skip root path as it should fall back to index.html
		if path != "/" && path != "" {
			trimmedPath := strings.TrimPrefix(path, "/")
			if _, err := fs.Stat(subFS, trimmedPath); err == nil {
				c.FileFromFS(trimmedPath, http.FS(subFS))
				return
			}
		}

		// 2. Otherwise serve index.html for SPA routing
		indexHtml, err := fs.ReadFile(subFS, "index.html")
		if err != nil {
			c.AbortWithStatus(http.StatusNotFound)
			return
		}
		c.Data(http.StatusOK, "text/html; charset=utf-8", indexHtml)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8088"
	}

	log.Printf("🚀 Docker Dashboard (Embedded) running on port %s", port)
	if err := r.Run("0.0.0.0:" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
