"""Pytest fixtures for shared library tests."""

import os
import pytest
import psycopg

from testdb import (
    TEST_DB_NAME,
    get_test_dsn,
    get_maintenance_dsn,
    assert_is_test_db,
    truncate_all_tables,
)

MIGRATIONS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "db", "migrations")
LOCAL_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "db", "local")


def _read_sql(directory, filename):
    path = os.path.join(directory, filename)
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


@pytest.fixture(scope="session")
def test_db_setup():
    """Ensure credenviel_test exists and has schema applied for integration tests."""
    m_dsn = get_maintenance_dsn()
    try:
        with psycopg.connect(m_dsn, autocommit=True) as conn:
            conn.execute(f"DROP DATABASE IF EXISTS {TEST_DB_NAME} WITH (FORCE)")
            conn.execute(f"CREATE DATABASE {TEST_DB_NAME}")
    except Exception as e:
        pytest.skip(f"PostgreSQL not available: {e}")

    t_dsn = get_test_dsn()
    with psycopg.connect(t_dsn, autocommit=True) as conn:
        assert_is_test_db(conn)
        conn.execute(_read_sql(MIGRATIONS_DIR, "001_initial_schema.up.sql"))
        conn.execute(_read_sql(MIGRATIONS_DIR, "002_status_guard.up.sql"))
        conn.execute(_read_sql(LOCAL_DIR, "001_local_queue.up.sql"))

    yield t_dsn

    # Teardown
    try:
        with psycopg.connect(m_dsn, autocommit=True) as conn:
            conn.execute(f"DROP DATABASE IF EXISTS {TEST_DB_NAME} WITH (FORCE)")
    except Exception:
        pass


@pytest.fixture
def queue_conn(test_db_setup):
    """Provide a connection to credenviel_test and truncate queue table before each test."""
    conn = psycopg.connect(test_db_setup, autocommit=True)
    assert_is_test_db(conn)
    truncate_all_tables(conn)
    yield conn
    conn.close()
