"""Pytest configuration for database migration tests.

The test harness uses the credenviel_test database exclusively.
It refuses to run against any other database name.
"""

import os
import pytest
import psycopg


TEST_DB_NAME = "credenviel_test"
POSTGRES_HOST = os.environ.get("PGHOST", "localhost")
POSTGRES_PORT = os.environ.get("PGPORT", "5433")
POSTGRES_USER = os.environ.get("PGUSER", "credenviel")
POSTGRES_PASSWORD = os.environ.get("PGPASSWORD", "localdev")

# Connection string to the 'postgres' maintenance DB (for CREATE/DROP DATABASE)
MAINTENANCE_DSN = (
    f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}"
    f"@{POSTGRES_HOST}:{POSTGRES_PORT}/postgres"
)

# Connection string to the test database
TEST_DSN = (
    f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}"
    f"@{POSTGRES_HOST}:{POSTGRES_PORT}/{TEST_DB_NAME}"
)

# Migration file paths (relative to repo root)
MIGRATIONS_DIR = os.path.join(os.path.dirname(__file__), "..", "migrations")
LOCAL_DIR = os.path.join(os.path.dirname(__file__), "..", "local")


def _read_sql(directory, filename):
    """Read a SQL file from the given directory."""
    path = os.path.join(directory, filename)
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


@pytest.fixture(scope="session")
def test_db():
    """Create the credenviel_test database (drop if exists) once per session."""
    if POSTGRES_HOST.lower() not in ("localhost", "127.0.0.1", "::1"):
        raise RuntimeError(
            f"SAFETY VIOLATION: Refusing to run tests against non-local database host '{POSTGRES_HOST}'. "
            f"Only 'localhost' or '127.0.0.1' is permitted."
        )
    conn = psycopg.connect(MAINTENANCE_DSN, autocommit=True)
    try:
        conn.execute(f"DROP DATABASE IF EXISTS {TEST_DB_NAME} WITH (FORCE)")
        conn.execute(f"CREATE DATABASE {TEST_DB_NAME}")
    finally:
        conn.close()

    yield TEST_DSN

    # Cleanup after session
    conn = psycopg.connect(MAINTENANCE_DSN, autocommit=True)
    try:
        conn.execute(f"DROP DATABASE IF EXISTS {TEST_DB_NAME} WITH (FORCE)")
    finally:
        conn.close()


@pytest.fixture
def db_conn(test_db):
    """Provide a connection to credenviel_test with safety check."""
    conn = psycopg.connect(test_db, autocommit=True)

    # Safety: refuse to run unless we're connected to the test DB
    result = conn.execute("SELECT current_database()").fetchone()
    assert result[0] == TEST_DB_NAME, (
        f"SAFETY: connected to '{result[0]}' instead of '{TEST_DB_NAME}'. Aborting."
    )

    yield conn
    conn.close()


@pytest.fixture
def fresh_schema(db_conn):
    """Apply migrations 001+002+003 on a clean database, yield connection, then tear down."""
    # Drop everything first (clean slate)
    db_conn.execute(_read_sql(MIGRATIONS_DIR, "003_review_rejection_guard.down.sql"))
    db_conn.execute(_read_sql(MIGRATIONS_DIR, "002_status_guard.down.sql"))
    db_conn.execute(_read_sql(MIGRATIONS_DIR, "001_initial_schema.down.sql"))

    # Apply up migrations
    db_conn.execute(_read_sql(MIGRATIONS_DIR, "001_initial_schema.up.sql"))
    db_conn.execute(_read_sql(MIGRATIONS_DIR, "002_status_guard.up.sql"))
    db_conn.execute(_read_sql(MIGRATIONS_DIR, "003_review_rejection_guard.up.sql"))

    yield db_conn

    # Tear down
    db_conn.execute(_read_sql(MIGRATIONS_DIR, "003_review_rejection_guard.down.sql"))
    db_conn.execute(_read_sql(MIGRATIONS_DIR, "002_status_guard.down.sql"))
    db_conn.execute(_read_sql(MIGRATIONS_DIR, "001_initial_schema.down.sql"))


@pytest.fixture
def fresh_schema_with_local_queue(fresh_schema):
    """Apply migrations 001+002 plus local queue, yield connection, then tear down."""
    fresh_schema.execute(_read_sql(LOCAL_DIR, "001_local_queue.up.sql"))
    yield fresh_schema
    fresh_schema.execute(_read_sql(LOCAL_DIR, "001_local_queue.down.sql"))
