# syntax=docker/dockerfile:1
# Production runtime image for Credenviel Go API
FROM alpine:3.20

# Create unprivileged non-root app user
RUN addgroup -S appuser && adduser -S -G appuser -u 10001 appuser

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app
COPY api/server /app/server

USER appuser

EXPOSE 8080

ENTRYPOINT ["/app/server"]
