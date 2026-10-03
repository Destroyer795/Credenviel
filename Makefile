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
	@PGPASSWORD=localdev psql -h localhost -U credenviel -d credenviel -f db/migrations/001_initial_schema.up.sql
	@echo "Migrations applied."

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
