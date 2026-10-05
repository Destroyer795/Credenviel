.PHONY: up down setup migrate migrate-down migrate-local run-api run-worker simulate-upload test test-integration demo lint

# Start local Postgres + Azurite (credenviel- containers only)
up:
	docker compose up -d

# Stop local services
down:
	docker compose down

# Setup local Python development dependencies
setup:
	pip install -r requirements-dev.txt
	pip install -e shared/python

# Apply database migrations (001 + 002) — never touches db/local/
migrate:
	@echo "Applying migrations against local Postgres..."
	docker compose exec -T postgres psql -U credenviel -d credenviel -f /migrations/001_initial_schema.up.sql
	docker compose exec -T postgres psql -U credenviel -d credenviel -f /migrations/002_status_guard.up.sql
	@echo "Migrations applied."

# Roll back database migrations (002 then 001)
migrate-down:
	@echo "Rolling back migrations against local Postgres..."
	docker compose exec -T postgres psql -U credenviel -d credenviel -f /migrations/002_status_guard.down.sql
	docker compose exec -T postgres psql -U credenviel -d credenviel -f /migrations/001_initial_schema.down.sql
	@echo "Migrations rolled back."

# Apply local-only dev tables (local queue) — piped through stdin, no container recreate
migrate-local:
	@echo "Applying local queue table..."
	docker compose exec -T postgres psql -U credenviel -d credenviel < db/local/001_local_queue.up.sql
	@echo "Local queue table applied."

# Run Go API server locally
run-api:
	cd api && go run ./cmd/server

# Run Python worker locally with stub extractor
run-worker:
	cd worker && python -m worker --stub-extractor

# Simulate blob-created upload event
simulate-upload:
	python -m functions.simulate $(JOB)

# Run unit tests (Python non-integration + Go unit tests)
test:
	@echo "=== Go Unit Tests ==="
	cd api && go test ./...
	@echo "=== Python Unit Tests ==="
	pytest -m "not integration" -v

# Run integration tests (requires make up)
test-integration:
	@echo "=== Go Integration Tests ==="
	cd api && go test -tags integration -v ./...
	@echo "=== Python Integration Tests ==="
	pytest -m integration -v

# Run cross-platform end-to-end demo
demo:
	python scripts/demo.py

# Lint all code
lint:
	@echo "TODO: Configure linters (golangci-lint, ruff, eslint)"
