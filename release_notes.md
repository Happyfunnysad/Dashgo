# Dashgo v0.1.3 - Build Hotfix

- **Bugfix:** Resolved a TypeScript compilation error in `Settings.test.tsx` that caused the GitHub Actions Docker build to fail with `exit code: 2`.

---

# Dashgo v0.1.2 - Onboarding & Network UX

- **Feature:** Added an **Onboarding Wizard** for first-time setup. Users are guided through setting up the Admin password, connecting to Tailscale (with a skip option), and configuring Network Settings.
- **Feature:** **Auto-detect Local Network IP**. The dashboard smartly infers the local IP address from the browser connection (`window.location.hostname`).
- **Feature:** **Tailscale Device Picker**. Replaced manual typing for Tailscale IP/Hostname with a dynamic `TailscaleDevicePickerModal` that scans the Tailnet and shows online peers.
- **Testing:** Introduced **Vitest** and **React Testing Library** for the frontend. Added comprehensive unit tests for the Onboarding Wizard, Tailscale Device Picker, and Settings.
- **Refactor:** Cleaned up `LoginPage` logic and shifted first-run setup logic entirely to the new Wizard flow.

---

# Dashgo v0.1.1 - Performance & Stability Release

This release addresses critical performance issues, metrics calculation inaccuracies, and stability on the backend:

- **Registry API Updates Verification**: Replaced high-overhead image layer downloads (`ImagePull`) with lightweight Registry API `HEAD` requests. Updates are now checked via headers without downloading layers.
- **Accurate CPU Usage Calculation**: Solved host metrics calculations by shifting from inaccurate system load average computations to precise delta calculations over a `/proc/stat` snapshot window.
- **Docker Client Context Timeouts**: Added robust per-call contexts with timeouts to ensure that Docker SDK operations cannot hang indefinitely if the daemon becomes unresponsive.
- **Go Toolchain Alignment**: Upgraded the backend `go.mod` Go version directive to `1.24.0` to match the builder image environment in the `Dockerfile`.
- **Test Coverage**: Added structured unit/integration test suites for all backend internal packages (`auth`, `db`, `docker`, `sys`, `updater`, `utils`).

---

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
