.PHONY: up down migrate test lint

# Start local Postgres + Azurite
up:
	docker compose up -d

# Stop local services
down:
	docker compose down

# Apply database migrations (up)
migrate:
	@echo "Applying migrations against local Postgres..."
	docker compose exec -T postgres psql -U credenviel -d credenviel -f /migrations/001_initial_schema.up.sql
	@echo "Migrations applied."

# Roll back database migrations (down)
migrate-down:
	@echo "Rolling back migrations against local Postgres..."
	docker compose exec -T postgres psql -U credenviel -d credenviel -f /migrations/001_initial_schema.down.sql
	@echo "Migrations rolled back."

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
