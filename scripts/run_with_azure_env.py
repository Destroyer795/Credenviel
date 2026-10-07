#!/usr/bin/env python3
"""Builds Azure environment variables from Key Vault and runs a given command without printing secrets."""

import os
import secrets
import shutil
import subprocess
import sys


def get_az_output(cmd_args: list[str]) -> str:
    """Run an az CLI command and return trimmed output."""
    az_bin = shutil.which("az") or "az"
    # On Windows, az is often az.cmd
    if sys.platform == "win32" and not az_bin.lower().endswith((".cmd", ".bat", ".exe")):
        az_cmd = shutil.which("az.cmd")
        if az_cmd:
            az_bin = az_cmd

    res = subprocess.run(
        [az_bin] + cmd_args,
        capture_output=True,
        text=True,
        check=False,
    )
    if res.returncode != 0:
        err_msg = res.stderr.strip() or res.stdout.strip()
        # Redact any possible secrets in error message
        raise RuntimeError(f"Azure CLI command failed ({' '.join(cmd_args[:3])}...): {err_msg}")
    return res.stdout.strip()


def resolve_azure_config():
    """Discover Azure resources in rg-credenviel-dev and fetch secrets securely."""
    rg = os.environ.get("AZURE_RESOURCE_GROUP", "rg-credenviel-dev")

    # 1. Key Vault
    vault_name = os.environ.get("KEY_VAULT_NAME", "")
    if not vault_name:
        vault_name = get_az_output([
            "keyvault", "list",
            "-g", rg,
            "--query", "[0].name",
            "-o", "tsv",
        ])
        if not vault_name or vault_name == "None":
            raise RuntimeError(f"No Key Vault found in resource group '{rg}'")

    # 2. Postgres Password from Key Vault
    pg_password = get_az_output([
        "keyvault", "secret", "show",
        "--vault-name", vault_name,
        "--name", "postgres-admin-password",
        "--query", "value",
        "-o", "tsv",
    ])
    if not pg_password or pg_password == "None":
        raise RuntimeError(f"Secret 'postgres-admin-password' not found in vault '{vault_name}'")

    # 3. Postgres Host
    db_host = os.environ.get("DATABASE_HOST", "")
    if not db_host:
        db_host = get_az_output([
            "postgres", "flexible-server", "list",
            "-g", rg,
            "--query", "[0].fullyQualifiedDomainName",
            "-o", "tsv",
        ])
        if not db_host or db_host == "None":
            raise RuntimeError(f"No Postgres Flexible Server found in resource group '{rg}'")

    # 4. Storage Account Name
    storage_account = os.environ.get("STORAGE_ACCOUNT_NAME", "")
    if not storage_account:
        storage_account = get_az_output([
            "storage", "account", "list",
            "-g", rg,
            "--query", "[0].name",
            "-o", "tsv",
        ])

    # 5. Service Bus FQDN
    sb_fqdn = os.environ.get("SERVICEBUS_FQDN", "")
    if not sb_fqdn:
        sb_name = get_az_output([
            "servicebus", "namespace", "list",
            "-g", rg,
            "--query", "[0].name",
            "-o", "tsv",
        ])
        if sb_name and sb_name != "None":
            sb_fqdn = f"{sb_name}.servicebus.windows.net"

    return {
        "rg": rg,
        "vault_name": vault_name,
        "db_host": db_host,
        "pg_password": pg_password,
        "storage_account": storage_account,
        "sb_fqdn": sb_fqdn,
    }


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/run_with_azure_env.py <command> [args...]", file=sys.stderr)
        sys.exit(1)

    command = sys.argv[1:]

    # Resolve Azure resources
    cfg = resolve_azure_config()

    pg_user = os.environ.get("PGUSER", "credenvieladmin")
    pg_db = os.environ.get("PGDATABASE", "credenviel")
    pg_port = os.environ.get("PGPORT", "5432")
    db_url = f"postgresql://{pg_user}:{cfg['pg_password']}@{cfg['db_host']}:{pg_port}/{pg_db}?sslmode=require"
    internal_key = secrets.token_hex(16)

    env = os.environ.copy()
    env.update({
        "AZURE_RESOURCE_GROUP": cfg["rg"],
        "DATABASE_HOST": cfg["db_host"],
        "DATABASE_URL": db_url,
        "PGHOST": cfg["db_host"],
        "PGPORT": pg_port,
        "PGUSER": pg_user,
        "PGPASSWORD": cfg["pg_password"],
        "PGDATABASE": pg_db,
        "PGSSLMODE": "require",
        "INTERNAL_API_KEY": internal_key,
        "APP_ENV": "local",
        "AUTH_MODE": "dev",
        "STORE_BACKEND": "blob",
        "QUEUE_BACKEND": "servicebus",
        "STORAGE_ACCOUNT_NAME": cfg["storage_account"],
        "SERVICEBUS_FQDN": cfg["sb_fqdn"],
        "SERVICEBUS_QUEUE": env.get("SERVICEBUS_QUEUE", "job-processing"),
    })

    # Safe log of what we are running — NO secrets printed
    print(f"[*] run_with_azure_env: running command with Azure env ({cfg['rg']}, {cfg['db_host']})")

    # Run the target command
    try:
        proc = subprocess.run(command, env=env)
        sys.exit(proc.returncode)
    except Exception as e:
        print(f"[!] Execution failed: {type(e).__name__}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
