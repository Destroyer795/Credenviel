"""Database test utilities with safety guards for credenviel_test."""

import os
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


def assert_is_test_db(conn: psycopg.Connection):
    """Refuse execution unless connected to credenviel_test."""
    res = conn.execute("SELECT current_database()").fetchone()
    if not res or res[0] != TEST_DB_NAME:
        raise RuntimeError(
            f"SAFETY VIOLATION: Refusing to run tests against '{res[0] if res else 'unknown'}'. "
            f"Only '{TEST_DB_NAME}' is permitted."
        )


def truncate_all_tables(conn: psycopg.Connection):
    """Safely truncate all pipeline tables in credenviel_test."""
    assert_is_test_db(conn)
    with conn.cursor() as cur:
        # Check if tables exist before truncating
        cur.execute(
            """
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name IN ('records', 'jobs', 'users', 'local_queue_messages')
            """
        )
        existing = [row[0] for row in cur.fetchall()]
        if existing:
            # Order to respect foreign keys: records -> jobs -> users, plus queue
            tables_to_truncate = []
            for t in ["records", "jobs", "users", "local_queue_messages"]:
                if t in existing:
                    tables_to_truncate.append(t)
            cur.execute(f"TRUNCATE TABLE {', '.join(tables_to_truncate)} CASCADE")
    if not conn.autocommit:
        conn.commit()
