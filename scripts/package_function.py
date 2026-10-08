#!/usr/bin/env python3
"""
Packages Azure Functions for cloud deployment.

Vendors shared library (credenviel_shared), bundles host.json, function_app.py,
core.py, and requirements.txt into a deployable zip artifact, and outputs
the exact deployment commands for the Azure CLI / Function Core Tools.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import zipfile

REPO_ROOT = Path(__file__).resolve().parent.parent
FUNCTIONS_DIR = REPO_ROOT / "functions"
SHARED_PYTHON_DIR = REPO_ROOT / "shared" / "python" / "credenviel_shared"
DEFAULT_OUTPUT_ZIP = REPO_ROOT / "dist" / "function-app.zip"


def get_az_output(cmd_args: list[str]) -> str:
    """Run an az CLI command safely and return trimmed output."""
    az_bin = shutil.which("az") or "az"
    if sys.platform == "win32" and not az_bin.lower().endswith((".cmd", ".bat", ".exe")):
        az_cmd = shutil.which("az.cmd")
        if az_cmd:
            az_bin = az_cmd

    try:
        res = subprocess.run(
            [az_bin] + cmd_args,
            capture_output=True,
            text=True,
            check=False,
        )
        if res.returncode == 0:
            return res.stdout.strip()
    except Exception:
        pass
    return ""


def discover_function_app_name(rg: str) -> str:
    """Attempt to discover the Function App name in the target resource group."""
    out = get_az_output([
        "functionapp", "list",
        "-g", rg,
        "--query", "[0].name",
        "-o", "tsv",
    ])
    if out and out != "None":
        return out
    return ""


def create_function_package(output_path: Path) -> Path:
    """Package the Function App into a zip archive with vendored shared dependencies."""
    output_path.parent.mkdir(parents=True, exist_ok=True)

    required_files = [
        FUNCTIONS_DIR / "host.json",
        FUNCTIONS_DIR / "function_app.py",
        FUNCTIONS_DIR / "core.py",
        FUNCTIONS_DIR / "requirements.txt",
    ]

    for req in required_files:
        if not req.exists():
            raise FileNotFoundError(f"Required function file missing: {req}")

    if not SHARED_PYTHON_DIR.exists():
        raise FileNotFoundError(f"Shared python library missing: {SHARED_PYTHON_DIR}")

    with tempfile.TemporaryDirectory(prefix="credenviel-func-") as tmpdir:
        staging = Path(tmpdir)

        # 1. Copy function files
        for src in required_files:
            shutil.copy2(src, staging / src.name)

        # 2. Vendor credenviel_shared
        vendor_dest = staging / "credenviel_shared"
        shutil.copytree(
            SHARED_PYTHON_DIR,
            vendor_dest,
            ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "*.pyo", ".pytest_cache"),
        )

        # 3. Create zip file
        with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for root, _, files in os.walk(staging):
                for file in files:
                    file_path = Path(root) / file
                    arcname = file_path.relative_to(staging).as_posix()
                    zf.write(file_path, arcname)

    return output_path


def verify_package(zip_path: Path) -> list[str]:
    """Verify archive contains all required components and return member list."""
    with zipfile.ZipFile(zip_path, "r") as zf:
        members = zf.namelist()

    required = [
        "host.json",
        "function_app.py",
        "core.py",
        "requirements.txt",
        "credenviel_shared/__init__.py",
    ]
    missing = [req for req in required if req not in members]
    if missing:
        raise ValueError(f"Package verification failed; missing: {missing}")

    return members


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Package Credenviel Azure Function App for deployment"
    )
    parser.add_argument(
        "--output",
        "-o",
        type=Path,
        default=DEFAULT_OUTPUT_ZIP,
        help="Target zip archive path (default: dist/function-app.zip)",
    )
    parser.add_argument(
        "--resource-group",
        "-g",
        default=os.getenv("AZURE_RESOURCE_GROUP", "rg-credenviel-dev"),
        help="Azure resource group name (default: rg-credenviel-dev)",
    )
    parser.add_argument(
        "--function-app-name",
        "-n",
        default="",
        help="Target Azure Function App name (auto-discovered if omitted)",
    )

    args = parser.parse_args()

    print("======================================================================")
    print("Credenviel Azure Function App Packaging Tool")
    print("======================================================================")
    print(f"Functions Source:  {FUNCTIONS_DIR}")
    print(f"Shared Library:    {SHARED_PYTHON_DIR}")
    print(f"Target Output:     {args.output}")

    zip_path = create_function_package(args.output)
    members = verify_package(zip_path)

    stat = zip_path.stat()
    size_kb = stat.st_size / 1024.0

    print(f"[+] Package built successfully: {zip_path}")
    print(f"    Size: {size_kb:.2f} KB ({len(members)} files)")
    print("\nPackage Contents:")
    for m in sorted(members):
        print(f"  - {m}")

    app_name = args.function_app_name or discover_function_app_name(args.resource_group)
    placeholder = app_name if app_name else "<FUNCTION_APP_NAME>"

    print("\n======================================================================")
    print("Deployment Commands for Azure:")
    print("======================================================================")
    print("Option 1: Azure CLI Zip Deployment (Recommended):")
    print(
        f"  az functionapp deployment source config-zip \\\n"
        f"    --resource-group {args.resource_group} \\\n"
        f"    --name {placeholder} \\\n"
        f"    --src {args.output.as_posix()} \\\n"
        f"    --build-remote true"
    )
    print("\nOption 2: Azure Functions Core Tools:")
    print(
        f"  cd functions && func azure functionapp publish {placeholder} --python"
    )
    print("======================================================================")


if __name__ == "__main__":
    main()
