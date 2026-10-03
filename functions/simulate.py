"""Simulate Azure Event Grid blob-created events for local testing.

Usage:
    python -m functions.simulate --job <job_id>
    make simulate-upload JOB=<job_id>
"""

import argparse
import os
import sys
import uuid

import psycopg

from credenviel_shared.local_queue import LocalQueue
from credenviel_shared.store import LocalFileStore
from functions.core import FunctionDeps, handle_blob_created


def get_default_db_url() -> str:
    host = os.environ.get("PGHOST", "localhost")
    port = os.environ.get("PGPORT", "5433")
    user = os.environ.get("PGUSER", "credenviel")
    password = os.environ.get("PGPASSWORD", "localdev")
    dbname = os.environ.get("PGDATABASE", "credenviel")
    return os.environ.get(
        "DATABASE_URL",
        f"postgresql://{user}:{password}@{host}:{port}/{dbname}",
    )


def simulate_upload(job_id_str: str, db_url: str | None = None) -> None:
    if db_url is None:
        db_url = get_default_db_url()

    try:
        job_id = uuid.UUID(job_id_str)
    except ValueError:
        print(f"Error: Invalid UUID format '{job_id_str}'", file=sys.stderr)
        sys.exit(1)

    store = LocalFileStore()
    prefix = f"raw-uploads/{job_id}"
    keys = store.list_keys(prefix)

    with psycopg.connect(db_url, autocommit=True) as conn:
        queue = LocalQueue(conn)
        deps = FunctionDeps(conn=conn, store=store, queue=queue)

        if not keys:
            print(f"No blobs found under '{prefix}'. Exercising missing blob path...")
            # Query db to get expected blob_key or construct one
            with conn.cursor() as cur:
                cur.execute("SELECT blob_key FROM jobs WHERE id = %s", (job_id,))
                row = cur.fetchone()
            dummy_key = row[0] if row else f"raw-uploads/{job_id}/missing.pdf"
            result = handle_blob_created(dummy_key, deps)
            print(f"Handled missing blob event: action={result.action}, reason={result.reason}")
        else:
            for key in keys:
                print(f"Firing blob_created event for '{key}'...")
                result = handle_blob_created(key, deps)
                print(f"Result: action={result.action}, job_id={result.job_id}, reason={result.reason}")


def main():
    parser = argparse.ArgumentParser(description="Simulate blob upload Event Grid trigger locally")
    parser.add_argument("job", nargs="?", help="Job UUID to simulate upload for")
    parser.add_argument("--job", dest="job_flag", help="Job UUID (alternative flag syntax)")
    parser.add_argument("--db-url", help="Database connection URL")

    args = parser.parse_args()
    job_id = args.job or args.job_flag
    if not job_id:
        parser.error("Job UUID must be specified via argument or --job")

    simulate_upload(job_id, args.db_url)


if __name__ == "__main__":
    main()
