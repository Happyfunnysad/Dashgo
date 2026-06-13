# --- Stage 1: Build Frontend ---
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# --- Stage 2: Build Backend ---
FROM golang:1.24-alpine AS backend-builder
RUN apk add --no-cache git
WORKDIR /app
ENV GOPROXY=direct
COPY backend-go/go.mod backend-go/go.sum ./
RUN go mod download
COPY backend-go/ ./
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o docker-dashboard main.go

# --- Stage 3: Final Image ---
FROM debian:bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tzdata && rm -rf /var/lib/apt/lists/*
COPY --from=docker.io/tailscale/tailscale:latest /usr/local/bin/tailscale /usr/bin/tailscale
COPY --from=backend-builder /app/docker-dashboard .
RUN mkdir -p /app/data

LABEL org.opencontainers.image.source="https://github.com/Happyfunnysad/Dashgo"
LABEL org.opencontainers.image.description="Lightweight Docker dashboard for SBCs and home servers"
LABEL org.opencontainers.image.licenses="MIT"

EXPOSE 8088
CMD ["./docker-dashboard"]
