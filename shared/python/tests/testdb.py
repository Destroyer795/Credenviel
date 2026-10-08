"""Database test utilities with safety guards for credenviel_test."""

import os
from pathlib import Path
import psycopg

TEST_DB_NAME = "credenviel_test"


def get_pg_config():
    """Retrieve postgres connection parameters from environment with safe defaults."""
    return {
        "host": os.environ.get("PGHOST", "localhost"),
        "port": os.environ.get("PGPORT", "5433"),
        "user": os.environ.get("PGUSER", "credenviel"),
        "password": os.environ.get("PGPASSWORD", "localdev"),
    }


def get_test_dsn():
    """Get DSN for credenviel_test."""
    cfg = get_pg_config()
    return f"postgresql://{cfg['user']}:{cfg['password']}@{cfg['host']}:{cfg['port']}/{TEST_DB_NAME}"


def get_maintenance_dsn():
    """Get DSN for the postgres maintenance DB."""
    cfg = get_pg_config()
    return f"postgresql://{cfg['user']}:{cfg['password']}@{cfg['host']}:{cfg['port']}/postgres"


def ensure_test_database():
    """Ensure credenviel_test database exists in Postgres, creating it if absent."""
    with psycopg.connect(get_maintenance_dsn(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (TEST_DB_NAME,))
            if cur.fetchone() is None:
                cur.execute(f"CREATE DATABASE {TEST_DB_NAME}")


def get_test_connection(autocommit: bool = True) -> psycopg.Connection:
    """Connect to credenviel_test, ensuring the database exists and safety checks pass."""
    ensure_test_database()
    conn = psycopg.connect(get_test_dsn(), autocommit=autocommit)
    assert_is_test_db(conn)
    return conn


def assert_is_test_db(conn: psycopg.Connection):
    """Refuse execution unless connected to credenviel_test on localhost."""
    cfg = get_pg_config()
    host = (cfg.get("host") or "").lower()
    if host not in ("localhost", "127.0.0.1", "::1"):
        raise RuntimeError(
            f"SAFETY VIOLATION: Refusing to run tests against non-local database host '{host}'. "
            f"Only 'localhost' or '127.0.0.1' is permitted."
        )
    res = conn.execute("SELECT current_database()").fetchone()
    if not res or res[0] != TEST_DB_NAME:
        raise RuntimeError(
            f"SAFETY VIOLATION: Refusing to run tests against '{res[0] if res else 'unknown'}'. "
            f"Only '{TEST_DB_NAME}' is permitted."
        )


def ensure_test_schema(conn: psycopg.Connection):
    """Ensure migrations 001, 002, and local queue 001 are applied in credenviel_test."""
    assert_is_test_db(conn)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'jobs'
            """
        )
        if cur.fetchone() is None:
            # Need to apply migrations
            repo_root = Path(__file__).resolve().parent.parent.parent.parent
            mig_001 = repo_root / "db" / "migrations" / "001_initial_schema.up.sql"
            mig_002 = repo_root / "db" / "migrations" / "002_status_guard.up.sql"
            mig_local = repo_root / "db" / "local" / "001_local_queue.up.sql"

            for sql_file in [mig_001, mig_002, mig_local]:
                if sql_file.exists():
                    sql = sql_file.read_text(encoding="utf-8")
                    cur.execute(sql)
            if not conn.autocommit:
                conn.commit()


def truncate_all_tables(conn: psycopg.Connection):
    """Safely truncate all pipeline tables in credenviel_test."""
    assert_is_test_db(conn)
    ensure_test_schema(conn)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name IN ('records', 'jobs', 'users', 'local_queue_messages')
            """
        )
        existing = [row[0] for row in cur.fetchall()]
        if existing:
            tables_to_truncate = []
            for t in ["records", "jobs", "users", "local_queue_messages"]:
                if t in existing:
                    tables_to_truncate.append(t)
            cur.execute(f"TRUNCATE TABLE {', '.join(tables_to_truncate)} CASCADE")
    if not conn.autocommit:
        conn.commit()
