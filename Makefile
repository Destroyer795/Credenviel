.PHONY: up down migrate migrate-down migrate-local test lint

# Start local Postgres + Azurite
up:
	docker compose up -d

# Stop local services
down:
	docker compose down

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

# Run all tests
test:
	@echo "=== Go API tests ==="
	cd api && go test ./...
	@echo "=== Python worker tests ==="
	cd worker && python -m pytest tests/ -v
	@echo "=== Python function tests ==="
	cd functions && python -m pytest tests/ -v
	@echo "=== Frontend build check ==="
	cd frontend && npm run build

# Lint all code
lint:
	@echo "TODO: Configure linters (golangci-lint, ruff, eslint)"
