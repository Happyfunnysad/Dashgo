# Dashgo v0.1.0 - Initial Release

Welcome to the first release of **Dashgo**!

Dashgo is a lightweight Docker dashboard designed for single-board computers and home servers. With a footprint of just ~25 MB, it provides a fast, password-protected dashboard for your containers with **Tailscale built in**.

## Key Features
- **Real-time Dashboard:** Monitor your containers along with host metrics (CPU, RAM, disk, temperature).
- **Compose Stacks:** Manage containers grouped by project.
- **Native Tailnet:** Built-in Tailscale support (device list, online status, MagicDNS).
- **Hardware Monitoring:** CPU, memory, disk, and temperature gauges (perfect for Raspberry Pi / Orange Pi).
- **Security:** Password-protected UI (bcrypt), session tokens, and per-IP brute-force lockout.
- **Webhook Notifications:** Alerts on container stop, unhealthy, or update-available events.
- **Lightweight Image:** Single ~25 MB Alpine image (`amd64` + `arm64`).

## Quick Start

```bash
docker run -d --name dashgo -p 8088:8088 \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v dashgo-data:/app/data \
  ghcr.io/happyfunnysad/dashgo:latest
```
