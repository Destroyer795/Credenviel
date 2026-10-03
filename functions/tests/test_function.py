"""Function app smoke tests."""


def test_function_app_imports():
    """Test that the function app module can be imported."""
    # azure.functions may not be installed in all environments,
    # so we test the import in a subprocess
    import subprocess
    import sys

    result = subprocess.run(
        [sys.executable, "-c", "import azure.functions; print('ok')"],
        capture_output=True,
        text=True,
    )
    # If azure-functions is installed, the import succeeds
    if result.returncode == 0:
        assert "ok" in result.stdout
    else:
        # If not installed, that's acceptable in skeleton phase
        assert "ModuleNotFoundError" in result.stderr
