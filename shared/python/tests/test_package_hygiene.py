"""Safety tests proving credenviel_shared exports no destructive DB capabilities."""

import importlib
import inspect
from pathlib import Path
import pytest
import credenviel_shared


def test_testdb_module_not_in_runtime_package():
    """credenviel_shared must not contain or export testdb."""
    with pytest.raises(ModuleNotFoundError):
        importlib.import_module("credenviel_shared.testdb")

    assert not hasattr(credenviel_shared, "testdb")
    assert "testdb" not in credenviel_shared.__all__


def test_credenviel_shared_exports_no_destructive_symbols():
    """No exported symbol may create/drop databases or truncate tables."""
    forbidden_prefixes = ("create_db", "drop_db", "truncate", "ensure_test")
    for name in dir(credenviel_shared):
        for prefix in forbidden_prefixes:
            assert not name.lower().startswith(prefix), f"Forbidden symbol exported: {name}"

    for name in credenviel_shared.__all__:
        for prefix in forbidden_prefixes:
            assert not name.lower().startswith(prefix), f"Forbidden symbol in __all__: {name}"


def test_runtime_source_contains_no_destructive_sql():
    """Package source files in credenviel_shared must never contain DDL to drop/create DBs or truncate."""
    package_dir = Path(credenviel_shared.__file__).resolve().parent
    forbidden_sql = ["CREATE DATABASE", "DROP DATABASE", "TRUNCATE TABLE"]

    for py_file in package_dir.glob("*.py"):
        content = py_file.read_text(encoding="utf-8").upper()
        for forbidden in forbidden_sql:
            assert forbidden not in content, (
                f"Destructive SQL '{forbidden}' found in runtime package file: {py_file.name}"
            )
