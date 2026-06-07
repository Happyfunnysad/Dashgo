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
COPY backend-go/go.mod backend-go/go.sum ./
RUN go mod download
COPY backend-go/ ./
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o docker-dashboard main.go

# --- Stage 3: Final Image ---
FROM alpine:latest
WORKDIR /app
RUN apk add --no-cache ca-certificates tzdata tailscale
COPY --from=backend-builder /app/docker-dashboard .
RUN mkdir -p /app/data

EXPOSE 8088
CMD ["./docker-dashboard"]
