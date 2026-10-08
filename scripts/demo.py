#!/usr/bin/env python3
"""Cross-platform end-to-end local demo for Phase 1 (Acceptance Test 18).

Flow:
1. Generate random INTERNAL_API_KEY
2. Start Go API subprocess in dev mode
3. Wait for API /healthz readiness
4. Create job via POST /api/v1/jobs with dev headers
5. PUT a tiny generated PDF (~300 bytes) to dev upload URL
6. Run simulate-upload for the job
7. Run Python worker with --once --stub-extractor
8. Print resulting jobs and records rows via psql
9. Stop API cleanly
"""

import json
import os
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Valid minimal ~300 byte PDF
DEMO_PDF_BYTES = (
    b"%PDF-1.4\n"
    b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
    b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
    b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n"
    b"4 0 obj\n<< /Length 53 >>\nstream\nBT /F1 12 Tf 72 712 Td (Credenviel Demo Degree Certificate) ET\nendstream\nendobj\n"
    b"xref\n0 5\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \n0000000215 00000 n \n"
    b"trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n318\n%%EOF\n"
)


def main():
    print("=" * 70)
    print("Credenviel Phase 1 Local Skeleton Demo")
    print("=" * 70)

    # 1. Generate run secret and config
    internal_key = secrets.token_hex(16)
    port = os.environ.get("PORT", "8080")
    pg_port = os.environ.get("PGPORT", "5433")
    pg_host = os.environ.get("PGHOST", "localhost")
    db_url = f"postgres://credenviel:localdev@{pg_host}:{pg_port}/credenviel?sslmode=disable"
    public_base_url = f"http://localhost:{port}"
    local_storage_root = str(REPO_ROOT / ".local-storage")

    print(f"[*] Configuration:")
    print(f"    - Database URL: {db_url}")
    print(f"    - API Port: {port}")
    print(f"    - Internal API Key: {internal_key[:8]}... (redacted)")
    print(f"    - Local Storage Root: {local_storage_root}")
    print(f"    - Demo PDF Size: {len(DEMO_PDF_BYTES)} bytes")

    # 2. Start Go API server
    print("\n[1/6] Starting Go API server...")
    api_env = os.environ.copy()
    api_env.update({
        "PORT": port,
        "DATABASE_URL": db_url,
        "APP_ENV": "local",
        "AUTH_MODE": "dev",
        "INTERNAL_API_KEY": internal_key,
        "PUBLIC_BASE_URL": public_base_url,
        "LOCAL_STORAGE_ROOT": local_storage_root,
        "MAX_UPLOAD_BYTES": "4194304",
    })

    api_proc = subprocess.Popen(
        ["go", "run", "./cmd/server"],
        cwd=str(REPO_ROOT / "api"),
        env=api_env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )

    try:
        # 3. Wait for API to be healthy
        health_url = f"{public_base_url}/healthz"
        ready = False
        for _ in range(50):
            try:
                with urllib.request.urlopen(health_url, timeout=1) as resp:
                    if resp.status == 200:
                        ready = True
                        break
            except Exception:
                time.sleep(0.2)

        if not ready:
            print("[!] API failed to start in time. Output:")
            if api_proc.stdout:
                print(api_proc.stdout.read())
            sys.exit(1)

        print("    API is healthy and listening.")

        # 4. Create job via dev auth
        print("\n[2/6] Creating job via POST /api/v1/jobs...")
        job_req_data = json.dumps({
            "filename": "degree_certificate.pdf",
            "content_type": "application/pdf",
            "size_bytes": len(DEMO_PDF_BYTES),
        }).encode("utf-8")

        req = urllib.request.Request(
            f"{public_base_url}/api/v1/jobs",
            data=job_req_data,
            headers={
                "Content-Type": "application/json",
                "X-Dev-User": "student-demo-user-01",
                "X-Dev-Role": "student",
                "X-Dev-Name": "Demo Student",
            },
            method="POST",
        )

        with urllib.request.urlopen(req, timeout=5) as resp:
            assert resp.status == 201, f"Expected 201, got {resp.status}"
            job_resp = json.loads(resp.read().decode("utf-8"))

        job_id = job_resp["job_id"]
        blob_key = job_resp["blob_key"]
        upload_url = job_resp["upload"]["url"]

        print(f"    Job created successfully:")
        print(f"    - Job ID:   {job_id}")
        print(f"    - Blob Key: {blob_key}")
        print(f"    - Dev Upload URL: {upload_url}")

        # 5. Upload PDF via dev upload endpoint
        upload_headers = {"Content-Type": "application/pdf"}
        if "headers" in job_resp.get("upload", {}):
            upload_headers.update(job_resp["upload"]["headers"])

        upload_req = urllib.request.Request(
            upload_url,
            data=DEMO_PDF_BYTES,
            headers=upload_headers,
            method="PUT",
        )
        with urllib.request.urlopen(upload_req, timeout=5) as resp:
            assert resp.status == 200, f"Expected 200 from upload, got {resp.status}"

        print(f"    Uploaded {len(DEMO_PDF_BYTES)} bytes to local store.")

        # 6. Run simulate-upload (Azure Function stand-in)
        print("\n[4/6] Running simulate-upload (Function stand-in)...")
        fn_env = os.environ.copy()
        fn_env.update({
            "PGPORT": pg_port,
            "PGHOST": pg_host,
            "LOCAL_STORAGE_ROOT": local_storage_root,
            "PYTHONPATH": str(REPO_ROOT),
        })

        sim_res = subprocess.run(
            [sys.executable, "-m", "functions.simulate", str(job_id)],
            cwd=str(REPO_ROOT),
            env=fn_env,
            capture_output=True,
            text=True,
        )
        if sim_res.returncode != 0:
            print(f"[!] simulate-upload failed (code {sim_res.returncode}):\n{sim_res.stderr}\n{sim_res.stdout}")
            sys.exit(1)

        print("    simulate-upload output:")
        for line in sim_res.stdout.strip().splitlines():
            print(f"      {line}")

        # 7. Run worker with --once --stub-extractor
        print("\n[5/6] Running Python worker with --once --stub-extractor...")
        worker_env = os.environ.copy()
        worker_env.update({
            "PGPORT": pg_port,
            "PGHOST": pg_host,
            "LOCAL_STORAGE_ROOT": local_storage_root,
            "API_INTERNAL_URL": public_base_url,
            "INTERNAL_API_KEY": internal_key,
            "CONFIDENCE_THRESHOLD": "0.85",
            "PYTHONPATH": str(REPO_ROOT / "worker") + os.pathsep + str(REPO_ROOT),
        })

        worker_res = subprocess.run(
            [sys.executable, "-m", "worker", "--once", "--stub-extractor"],
            cwd=str(REPO_ROOT / "worker"),
            env=worker_env,
            capture_output=True,
            text=True,
        )
        if worker_res.returncode != 0:
            print(f"[!] worker failed (code {worker_res.returncode}):\n{worker_res.stderr}\n{worker_res.stdout}")
            sys.exit(1)

        print("    worker output:")
        for line in worker_res.stderr.strip().splitlines():
            print(f"      {line}")

        # 8. Query database and display results via psql
        print("\n[6/6] Pipeline Results from PostgreSQL:")
        print("-" * 70)
        print(">> jobs row:")
        jobs_query = (
            f"SELECT id, status, failure_reason, uploader_is_issuer, blob_key, created_at, updated_at "
            f"FROM jobs WHERE id = '{job_id}';"
        )
        subprocess.run(
            ["docker", "compose", "exec", "-T", "postgres", "psql", "-U", "credenviel", "-d", "credenviel", "-x", "-c", jobs_query],
            cwd=str(REPO_ROOT),
        )

        print("\n>> records row:")
        records_query = (
            f"SELECT id, job_id, public_verification_id, name, roll_number, degree, cgpa, issue_date, "
            f"source_hash, fields_hash, verified_by_issuer "
            f"FROM records WHERE job_id = '{job_id}';"
        )
        subprocess.run(
            ["docker", "compose", "exec", "-T", "postgres", "psql", "-U", "credenviel", "-d", "credenviel", "-x", "-c", records_query],
            cwd=str(REPO_ROOT),
        )

        print("=" * 70)
        print("Demo completed successfully! End-to-end pipeline is operational.")
        print("=" * 70)

    finally:
        # 9. Clean shutdown of API server
        print("\n[*] Stopping Go API server...")
        api_proc.terminate()
        try:
            api_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            api_proc.kill()
        print("    Go API server stopped.")


if __name__ == "__main__":
    main()
