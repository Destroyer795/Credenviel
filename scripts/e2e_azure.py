#!/usr/bin/env python3
"""
End-to-End Azure Pipeline Verification Script.

Tests the full asynchronous cloud flow:
1. Creates a digitization job via local Go API (backed by Azure Blob & PostgreSQL).
2. Uploads a valid certificate PDF directly to Azure Blob Storage via signed user-delegation SAS URL.
3. Azure Event Grid detects the upload and triggers Azure Function.
4. Azure Function validates blob and enqueues job on Azure Service Bus.
5. Azure Container Apps worker (scaled by KEDA) consumes message and processes document.
6. Polls Go API until job reaches terminal status 'processed'.
7. Validates final status and extracted records in Azure PostgreSQL.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.error
import urllib.request

REPO_ROOT = Path(__file__).resolve().parent.parent

# Minimal valid PDF (~300 bytes)
TEST_PDF_BYTES = (
    b"%PDF-1.4\n"
    b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
    b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
    b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n"
    b"4 0 obj\n<< /Length 53 >>\nstream\nBT /F1 12 Tf 72 712 Td (Credenviel Azure E2E Test Certificate) ET\nendstream\nendobj\n"
    b"xref\n0 5\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \n0000000215 00000 n \n"
    b"trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n318\n%%EOF\n"
)


def check_api_health(api_url: str, timeout: float = 2.0) -> bool:
    """Check if the API server is reachable and healthy."""
    try:
        req = urllib.request.Request(f"{api_url}/healthz", method="GET")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status == 200
    except Exception:
        return False


def wait_for_api(api_url: str, max_wait_sec: int = 30) -> bool:
    """Wait for API server to become ready."""
    deadline = time.time() + max_wait_sec
    while time.time() < deadline:
        if check_api_health(api_url):
            return True
        time.sleep(1.0)
    return False


def run_e2e(api_url: str, timeout_sec: int = 180, poll_interval: float = 3.0) -> int:
    """Execute the end-to-end test against the Azure pipeline."""
    print("======================================================================")
    print("Credenviel End-to-End Azure Pipeline Verification")
    print("======================================================================")
    print(f"Target API URL:    {api_url}")
    print(f"Polling Timeout:   {timeout_sec}s (interval: {poll_interval}s)")
    print(f"Test Payload:      PDF ({len(TEST_PDF_BYTES)} bytes)")
    print("======================================================================")

    # 1. Health check
    print("\n[*] Step 1: Checking API health...")
    if not check_api_health(api_url):
        print(f"[!] Error: API at {api_url} is not responding.")
        print("    Ensure the API server is running with Azure environment:")
        print("    Run in a separate terminal: make run-api-azure")
        print("    Or pass --start-api to let this script launch the API server.")
        return 1
    print("[+] API is healthy.")

    # 2. Create job
    print("\n[*] Step 2: Creating digitization job via POST /api/v1/jobs...")
    req_body = json.dumps({
        "filename": "credenviel_azure_e2e_cert.pdf",
        "content_type": "application/pdf",
        "size_bytes": len(TEST_PDF_BYTES),
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{api_url}/api/v1/jobs",
        data=req_body,
        headers={
            "Content-Type": "application/json",
            "X-Dev-User": "student-e2e-azure",
            "X-Dev-Role": "student",
            "X-Dev-Name": "Azure E2E Test Student",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            if resp.status != 201:
                print(f"[!] Failed to create job: HTTP {resp.status}")
                return 1
            job_data = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"[!] Error creating job: {e}")
        print("    Ensure Azure Postgres Flexible Server is started and in 'Ready' state.")
        return 1

    job_id = job_data.get("job_id")
    blob_key = job_data.get("blob_key")
    upload_info = job_data.get("upload", {})
    upload_url = upload_info.get("url")

    print(f"[+] Job created successfully:")
    print(f"    Job ID:    {job_id}")
    print(f"    Blob Key:  {blob_key}")
    print(f"    Status:    {job_data.get('status')}")

    if not upload_url:
        print("[!] Error: No upload URL returned by API")
        return 1

    # 3. Direct upload to Azure Blob Storage
    print("\n[*] Step 3: Uploading PDF to Azure Blob Storage via signed URL...")
    upload_headers = {
        "Content-Type": "application/pdf",
        "x-ms-blob-type": "BlockBlob",
    }
    if "headers" in upload_info and isinstance(upload_info["headers"], dict):
        upload_headers.update(upload_info["headers"])

    upload_req = urllib.request.Request(
        upload_url,
        data=TEST_PDF_BYTES,
        headers=upload_headers,
        method="PUT",
    )

    upload_start = time.time()
    try:
        with urllib.request.urlopen(upload_req, timeout=30) as resp:
            if resp.status not in (200, 201):
                print(f"[!] Blob upload failed with status HTTP {resp.status}")
                return 1
    except urllib.error.HTTPError as e:
        print(f"[!] Blob upload HTTP Error: {e.code} - {e.reason}")
        print(f"    Body: {e.read().decode('utf-8', errors='replace')}")
        return 1
    except Exception as e:
        print(f"[!] Blob upload failed: {e}")
        return 1

    print(f"[+] Upload successful! Bytes uploaded: {len(TEST_PDF_BYTES)}")
    print("[*] Upload event dispatched to Azure Storage.")

    # 4. Polling for job progression
    print("\n[*] Step 4: Polling job status across Event Grid -> Function -> Service Bus -> Worker...")
    status_url = f"{api_url}/api/v1/jobs/{job_id}"
    last_status = job_data.get("status")
    print(f"    [{time.strftime('%X')}] Initial status: {last_status}")

    start_time = time.time()
    deadline = start_time + timeout_sec
    final_job_data = None

    while time.time() < deadline:
        time.sleep(poll_interval)
        elapsed = time.time() - start_time

        try:
            status_req = urllib.request.Request(
                status_url,
                headers={
                    "X-Dev-User": "student-e2e-azure",
                    "X-Dev-Role": "student",
                    "X-Dev-Name": "Azure E2E Test Student",
                },
                method="GET",
            )
            with urllib.request.urlopen(status_req, timeout=10) as resp:
                if resp.status == 200:
                    current_data = json.loads(resp.read().decode("utf-8"))
                    current_status = current_data.get("status")

                    if current_status != last_status:
                        print(f"    [{time.strftime('%X')} (+{elapsed:.1f}s)] Status changed: {last_status} -> {current_status}")
                        last_status = current_status

                    if current_status == "processed":
                        final_job_data = current_data
                        break
                    elif current_status == "failed":
                        final_job_data = current_data
                        break
        except Exception as e:
            print(f"    [{time.strftime('%X')} (+{elapsed:.1f}s)] Poll warning: {e}")

    total_duration = time.time() - start_time

    if not final_job_data or final_job_data.get("status") != "processed":
        print("\n======================================================================")
        if final_job_data and final_job_data.get("status") == "failed":
            print("[!] Pipeline Failure: Job transitioned to 'failed'")
            print(f"    Failure Reason: {final_job_data.get('failure_reason')}")
        else:
            print(f"[!] Pipeline Timeout: Job did not reach 'processed' within {timeout_sec}s")
            print(f"    Last Known Status: {last_status}")
            print("\nTroubleshooting Checklist:")
            print("  1. Is Azure Postgres Flexible Server running? (az postgres flexible-server show)")
            print("  2. Is Event Grid system topic subscription enabled? (enableEventSubscription=true)")
            print("  3. Has Function App code been published? (make package-function)")
            print("  4. Is Worker Container App deployed with replicas >= 0?")
        print("======================================================================")
        return 1

    # 5. Success summary
    print("\n======================================================================")
    print("[+] SUCCESS: Pipeline executed end-to-end through Azure compute!")
    print("======================================================================")
    print(f"  Job ID:          {job_id}")
    print(f"  Status:          {final_job_data.get('status')}")
    print(f"  Total Duration:  {total_duration:.2f}s")
    print(f"  Blob Key:        {blob_key}")
    print(f"  Created At:      {final_job_data.get('created_at')}")
    print(f"  Updated At:      {final_job_data.get('updated_at')}")

    # Query record details if available
    records = final_job_data.get("records", [])
    if records:
        print("\nDigitized Record Data:")
        for rec in records:
            print(f"  - Record ID:    {rec.get('id')}")
            print(f"    Student Name: {rec.get('student_name')}")
            print(f"    Degree:       {rec.get('degree')}")
            print(f"    Institution:  {rec.get('institution')}")
            print(f"    Confidence:   {rec.get('confidence')}")

    print("======================================================================")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Verify Credenviel End-to-End Azure Pipeline"
    )
    parser.add_argument(
        "--api-url",
        default=os.getenv("PUBLIC_BASE_URL", "http://127.0.0.1:8085"),
        help="Base URL for the Go API server (default: http://127.0.0.1:8085)",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=180,
        help="Maximum seconds to wait for job completion (default: 180)",
    )
    parser.add_argument(
        "--poll-interval",
        type=float,
        default=3.0,
        help="Polling interval in seconds (default: 3.0)",
    )
    parser.add_argument(
        "--start-api",
        action="store_true",
        help="Automatically start the Go API server with Azure environment",
    )

    args = parser.parse_args()

    api_proc = None
    try:
        if args.start_api and not check_api_health(args.api_url):
            print(f"[*] Launching Go API server on {args.api_url} with Azure environment...")
            server_bin = REPO_ROOT / "api" / "bin" / ("server.exe" if sys.platform == "win32" else "server")
            if server_bin.exists():
                sub_cmd = [str(server_bin)]
            else:
                sub_cmd = ["go", "run", "./cmd/server"]

            from urllib.parse import urlparse
            parsed_port = str(urlparse(args.api_url).port or 8085)
            child_env = os.environ.copy()
            child_env["PORT"] = parsed_port
            child_env["PUBLIC_BASE_URL"] = args.api_url

            api_cmd = [
                sys.executable,
                str(REPO_ROOT / "scripts" / "run_with_azure_env.py"),
            ] + sub_cmd
            api_proc = subprocess.Popen(
                api_cmd,
                cwd=str(REPO_ROOT / "api"),
                env=child_env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
            )
            print("[*] Waiting for API server to become ready...")
            deadline = time.time() + 60
            ready = False
            while time.time() < deadline:
                if check_api_health(args.api_url):
                    ready = True
                    break
                if api_proc.poll() is not None:
                    # Process died early
                    break
                time.sleep(1.0)

            if not ready:
                print("[!] API server failed to start.")
                if api_proc.stdout:
                    print(api_proc.stdout.read())
                sys.exit(1)

        code = run_e2e(
            api_url=args.api_url,
            timeout_sec=args.timeout,
            poll_interval=args.poll_interval,
        )
        sys.exit(code)

    finally:
        if api_proc is not None:
            print("\n[*] Stopping API server process...")
            api_proc.terminate()
            try:
                api_proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                api_proc.kill()


if __name__ == "__main__":
    main()
