# syntax=docker/dockerfile:1
FROM golang:1.24-alpine AS builder

WORKDIR /build

# Install ca-certificates and git
RUN apk add --no-cache ca-certificates git

# Copy dependency manifests
COPY api/go.mod api/go.sum ./
RUN go mod download

# Copy source code
COPY api/cmd ./cmd
COPY api/internal ./internal

# Build static binary
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /app/server ./cmd/server

# Minimal runtime image
FROM alpine:3.20

# Create unprivileged non-root app user
RUN addgroup -S appuser && adduser -S -G appuser -u 10001 appuser

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app
COPY --from=builder /app/server /app/server

USER appuser

EXPOSE 8080

ENTRYPOINT ["/app/server"]
