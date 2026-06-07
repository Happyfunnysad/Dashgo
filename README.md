# Dashgo

Lightweight Docker dashboard for single-board computers and home servers.  
Go backend, React + TypeScript frontend, single binary, ~25 MB image.

![License](https://img.shields.io/badge/license-MIT-blue)

## Features

- **Dashboard** — real-time container monitoring with host metrics (CPU, RAM, disk, temperature)
- **Compose stacks** — group containers by project, start/stop/restart entire stacks
- **Details drawer** — click any container to see ports, resource usage, logs, inspect, and access links
- **Image updates** — checks Docker Hub for newer images, highlights outdated containers
- **Tailnet integration** — built-in Tailscale: view devices, MagicDNS, published services via tailnet
- **Hardware monitoring** — CPU, memory, disk, temperature gauges (great for Orange Pi / Raspberry Pi)
- **Authentication** — password-protected UI with bcrypt and session tokens
- **Settings** — sectioned UI: General, Network, Tailscale, Notifications, Security, Advanced
- **Webhook notifications** — POST alerts on container stop, unhealthy, update available
- **Access links** — auto-generated Local / Tailscale / Domain links for every published port

## Quick Start

```bash
git clone https://github.com/Happyfunnysad/Dashgo.git
cd Dashgo
docker compose up -d
```

Open `http://<your-ip>:8088`. On first launch you'll be prompted to set an admin password.

## Stack

| Layer    | Technology                          |
|----------|-------------------------------------|
| Backend  | Go 1.24, net/http, Docker Engine API |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Auth     | bcrypt + in-memory session tokens (24 h TTL) |
| Storage  | JSON file (`/app/data/config.json`) |
| Image    | Alpine Linux, ~25 MB final image    |

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Browser                                        │
│  React SPA (Dashboard · Tailnet · Settings)     │
└────────────────────┬────────────────────────────┘
                     │ HTTP / JSON
┌────────────────────▼────────────────────────────┐
│  Go Backend (single binary)                     │
│  ├── /api/containers    Container CRUD + stats  │
│  ├── /api/stats         Aggregate statistics    │
│  ├── /api/hardware      CPU, RAM, disk, temp    │
│  ├── /api/updates       Image update checks     │
│  ├── /api/tailscale/*   Tailscale status + mgmt │
│  ├── /api/auth/*        Login, setup, logout    │
│  ├── /api/settings      Configuration           │
│  ├── /api/aliases       Container aliases       │
│  └── /api/projects/*    Compose stack actions    │
│                                                  │
│  Docker socket (/var/run/docker.sock)            │
│  Tailscale socket (shared /tmp volume)           │
│  Host /proc, /sys (hardware metrics)             │
└──────────────────────────────────────────────────┘
```

## docker-compose.yml

```yaml
services:
  docker-dashboard:
    build: .
    container_name: docker-dashboard
    ports:
      - "8088:8088"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./data:/app/data
      - tailscale_sock:/tmp
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
    environment:
      - DOCKER_SOCKET=/var/run/docker.sock
      - DB_PATH=/app/data/config.json
    restart: unless-stopped

  tailscale:
    image: tailscale/tailscale:latest
    container_name: dashgo-tailscale
    environment:
      - TS_AUTHKEY=${TS_AUTHKEY:-}
      - TS_STATE_DIR=/var/lib/tailscale
      - TS_USERSPACE=false
    volumes:
      - tailscale_data:/var/lib/tailscale
      - tailscale_sock:/tmp
      - /dev/net/tun:/dev/net/tun
    cap_add:
      - net_admin
      - sys_module
    restart: unless-stopped

volumes:
  tailscale_data:
  tailscale_sock:
```

## Project Structure

```
dashgo/
├── backend-go/
│   ├── main.go                    # Entry point
│   └── internal/
│       ├── api/handlers.go        # HTTP handlers + auth middleware
│       ├── auth/auth.go           # bcrypt auth + sessions
│       ├── db/db.go               # JSON config persistence
│       ├── docker/docker.go       # Docker Engine API client
│       ├── features/features.go   # Updates, hardware, Tailscale
│       └── models/models.go       # Shared types
├── frontend/
│   ├── src/
│   │   ├── pages/                 # Dashboard, TailscalePage, Settings, LoginPage
│   │   ├── components/            # Sidebar, Modals, Tailscale widgets
│   │   ├── hooks/                 # useTailscaleStatus
│   │   └── utils/                 # api.ts, formatters, authStorage
│   ├── index.html
│   └── vite.config.ts
├── Dockerfile                     # Multi-stage: node → go → alpine
├── docker-compose.yml
└── README.md
```

## Security

- Docker socket is mounted **read-only**
- All API routes are protected by auth middleware (except `/health` and `/api/auth/status`)
- Passwords are hashed with **bcrypt** (cost 12)
- Sessions expire after **24 hours**
- First launch allows password setup without authentication

> **Note:** Access to the Docker socket grants root-level control over the host.
> Always use authentication and restrict network access.

## Environment Variables

| Variable        | Default                      | Description              |
|-----------------|------------------------------|--------------------------|
| `DOCKER_SOCKET` | `/var/run/docker.sock`       | Docker socket path       |
| `DB_PATH`       | `/app/data/config.json`      | Config file path         |
| `PORT`          | `8088`                       | HTTP listen port         |
| `TS_AUTHKEY`    | —                            | Tailscale auth key       |

## License

MIT