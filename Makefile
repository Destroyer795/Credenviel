.PHONY: up down setup migrate migrate-down migrate-local run-api run-worker simulate-upload test test-integration test-azure run-api-azure migrate-azure package-function e2e-azure scale-test-azure demo lint

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

# Apply database migrations (001 + 002 + 003) — never touches db/local/
migrate:
	@echo "Applying migrations against local Postgres..."
	docker compose exec -T postgres psql -U credenviel -d credenviel -f /migrations/001_initial_schema.up.sql
	docker compose exec -T postgres psql -U credenviel -d credenviel -f /migrations/002_status_guard.up.sql
	docker compose exec -T postgres psql -U credenviel -d credenviel -f /migrations/003_review_rejection_guard.up.sql
	@echo "Migrations applied."

# Roll back database migrations (003 then 002 then 001)
migrate-down:
	@echo "Rolling back migrations against local Postgres..."
	docker compose exec -T postgres psql -U credenviel -d credenviel -f /migrations/003_review_rejection_guard.down.sql
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
	pytest -m "not integration and not azure" -v

# Run integration tests (requires make up)
test-integration:
	@echo "=== Go Integration Tests ==="
	cd api && go test -tags integration -v ./...
	@echo "=== Python Integration Tests ==="
	pytest -m "integration and not azure" -v

# Run Azure adapter tests (requires Azure login and dev resources)
test-azure:
	@echo "=== Azure Adapter Tests (Python) ==="
	python scripts/run_with_azure_env.py pytest -m azure -v
	@echo "=== Azure Adapter Tests (Go SAS) ==="
	cd api && python ../scripts/run_with_azure_env.py go test -tags azure -v ./...

# Run Go API server locally against Azure resources (STORE_BACKEND=blob)
run-api-azure:
	cd api && python ../scripts/run_with_azure_env.py go run ./cmd/server

# Apply migrations 001 and 002 to Azure PostgreSQL Flexible Server
migrate-azure:
	python scripts/migrate_azure.py

# Run cross-platform end-to-end demo
demo:
	python scripts/demo.py

# Package Azure Function App into deployable zip
package-function:
	python scripts/package_function.py

# Run end-to-end verification against Azure pipeline
e2e-azure:
	python scripts/e2e_azure.py --start-api

# Run KEDA scale verification test against Azure pipeline
scale-test-azure:
	python scripts/scale_test_azure.py --start-api

# Lint all code
lint:
	@echo "TODO: Configure linters (golangci-lint, ruff, eslint)"


