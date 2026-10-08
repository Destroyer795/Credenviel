#!/usr/bin/env python3
"""Apply database migrations (001 and 002 ONLY) to Azure PostgreSQL Flexible Server.

Safety features:
- Displays target host and database clearly.
- Requires explicit typed confirmation ('yes').
- Strictly excludes db/local migrations.
- Never prints passwords or credentials.
"""

import os
from pathlib import Path
import shutil
import subprocess
import sys

from run_with_azure_env import resolve_azure_config

REPO_ROOT = Path(__file__).resolve().parent.parent


def ensure_firewall_rule(cfg: dict, target_host: str) -> None:
    """Ensure developer's current public IP is permitted through the Postgres firewall."""
    try:
        import urllib.request
        with urllib.request.urlopen("https://api.ipify.org", timeout=5) as resp:
            my_ip = resp.read().decode("utf-8").strip()
        server_name = target_host.split(".")[0]
        rule_name = f"dev-{my_ip.replace('.', '-')}"
        az_bin = shutil.which("az.cmd") or shutil.which("az") or "az"
        print(f"[*] Ensuring firewall rule '{rule_name}' exists for IP {my_ip}...")
        res = subprocess.run([
            az_bin, "postgres", "flexible-server", "firewall-rule", "create",
            "-g", cfg["rg"],
            "-s", server_name,
            "-n", rule_name,
            "--start-ip-address", my_ip,
            "--end-ip-address", my_ip,
        ], check=False, capture_output=True, text=True)
        if res.returncode == 0:
            print(f"[✓] Firewall rule verified for {my_ip}")
        else:
            print(f"[!] Note: Firewall rule check: {res.stderr.strip() or res.stdout.strip()}")
    except Exception as e:
        print(f"[*] Note: Firewall check skipped: {e}")


def main():
    print("=" * 70)
    print("Credenviel Azure PostgreSQL Migration Runner")
    print("=" * 70)

    try:
        cfg = resolve_azure_config()
    except Exception as e:
        print(f"[!] Failed to resolve Azure environment: {e}", file=sys.stderr)
        sys.exit(1)

    target_host = cfg["db_host"]
    target_db = "credenviel"
    target_user = "credenvieladmin"

    migrations = [
        REPO_ROOT / "db" / "migrations" / "001_initial_schema.up.sql",
        REPO_ROOT / "db" / "migrations" / "002_status_guard.up.sql",
    ]

    for mig in migrations:
        if not mig.exists():
            print(f"[!] Migration file not found: {mig}", file=sys.stderr)
            sys.exit(1)

    print(f"Target Resource Group: {cfg['rg']}")
    print(f"Target Host:           {target_host}")
    print(f"Target Database:       {target_db}")
    print(f"Target User:           {target_user}")
    print(f"Migrations to apply:")
    for mig in migrations:
        print(f"  - {mig.relative_to(REPO_ROOT)}")
    print("=" * 70)
    print("WARNING: This will apply migrations to the live Azure PostgreSQL database.")
    print("Type 'yes' to proceed: ", end="", flush=True)

    try:
        confirmation = sys.stdin.readline().strip()
    except (KeyboardInterrupt, EOFError):
        print("\nAborted.")
        sys.exit(1)

    if confirmation.lower() != "yes":
        print("Aborted by user.")
        sys.exit(1)

    ensure_firewall_rule(cfg, target_host)

    print("\n[*] Applying migrations...")

    # Combine migrations SQL
    combined_sql = ""
    for mig in migrations:
        combined_sql += f"\n-- {mig.name} --\n"
        combined_sql += mig.read_text(encoding="utf-8") + "\n"

    # Check tools available: native psql -> docker psql -> psycopg
    psql_bin = shutil.which("psql")
    docker_bin = shutil.which("docker")
    docker_available = False
    if docker_bin and not psql_bin:
        chk = subprocess.run([docker_bin, "info"], capture_output=True)
        docker_available = (chk.returncode == 0)

    if psql_bin:
        print("[*] Running native psql...")
        env = os.environ.copy()
        env["PGPASSWORD"] = cfg["pg_password"]
        cmd = [
            psql_bin,
            "-h", target_host,
            "-p", "5432",
            "-U", target_user,
            "-d", target_db,
            "-v", "ON_ERROR_STOP=1",
            "--set=sslmode=require",
        ]
        res = subprocess.run(cmd, input=combined_sql, text=True, capture_output=True, env=env)
        if res.returncode != 0:
            print("[!] Migration failed with psql:", file=sys.stderr)
            print(res.stderr or res.stdout, file=sys.stderr)
            sys.exit(1)
        print(res.stdout)
    elif docker_available:
        print("[*] Running psql via docker (postgres:16)...")
        docker_cmd = [
            docker_bin, "run", "--rm", "-i",
            "-e", f"PGPASSWORD={cfg['pg_password']}",
            "postgres:16",
            "psql",
            "-h", target_host,
            "-p", "5432",
            "-U", target_user,
            "-d", target_db,
            "-v", "ON_ERROR_STOP=1",
            "--set=sslmode=require",
        ]
        res = subprocess.run(docker_cmd, input=combined_sql, text=True, capture_output=True)
        if res.returncode != 0:
            print("[!] Migration failed with docker psql:", file=sys.stderr)
            print(res.stderr or res.stdout, file=sys.stderr)
            sys.exit(1)
        print(res.stdout)
    else:
        print("[*] Applying migrations using psycopg...")
        try:
            import psycopg
        except ImportError:
            print("[*] Installing psycopg[binary]...")
            subprocess.run([sys.executable, "-m", "pip", "install", "psycopg[binary]"], check=True)
            import psycopg

        try:
            conn_str = f"postgresql://{target_user}:{cfg['pg_password']}@{target_host}:5432/{target_db}?sslmode=require"
            with psycopg.connect(conn_str, autocommit=True) as conn:
                with conn.cursor() as cur:
                    for mig in migrations:
                        sql = mig.read_text(encoding="utf-8")
                        cur.execute(sql)
                        print(f"    Applied {mig.name}")
        except Exception as e:
            print(f"[!] Migration failed: {e}", file=sys.stderr)
            sys.exit(1)

    print("\n[✓] Migrations 001 and 002 applied successfully to Azure PostgreSQL!")


if __name__ == "__main__":
    main()
