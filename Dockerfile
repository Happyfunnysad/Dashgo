# syntax=docker/dockerfile:1

# --- Stage 1: Build Frontend ---
# Frontend output is architecture-independent, so build it once on the runner.
FROM --platform=$BUILDPLATFORM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- Stage 2: Build Backend ---
# Cross-compile on the runner instead of emulating each target architecture.
FROM --platform=$BUILDPLATFORM golang:1.24-alpine AS backend-builder
ARG TARGETOS
ARG TARGETARCH
RUN apk add --no-cache git
WORKDIR /app
ENV GOPROXY=https://proxy.golang.org,direct
COPY backend-go/go.mod backend-go/go.sum ./
RUN go mod download
COPY backend-go/ ./
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -ldflags="-s -w" -o docker-dashboard main.go

# --- Stage 3: Final Image ---
FROM docker/compose-bin:latest AS compose-bin

FROM debian:bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tzdata && rm -rf /var/lib/apt/lists/*
COPY --from=docker.io/tailscale/tailscale:latest /usr/local/bin/tailscale /usr/bin/tailscale
COPY --from=compose-bin /docker-compose /usr/local/bin/docker-compose
COPY --from=backend-builder /app/docker-dashboard .
RUN mkdir -p /app/data

LABEL org.opencontainers.image.source="https://github.com/Happyfunnysad/Dashgo"
LABEL org.opencontainers.image.description="Lightweight Docker dashboard for SBCs and home servers"
LABEL org.opencontainers.image.licenses="MIT"

EXPOSE 8088
CMD ["./docker-dashboard"]
