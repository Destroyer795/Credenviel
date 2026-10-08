#!/usr/bin/env python3
"""
Scale Test Verification Script for Azure Container Apps & KEDA.

Exercises KEDA dynamic auto-scaling from 0 to N replicas:
1. Submits a burst of 25 certificate digitization jobs via the API.
2. Uploads test PDFs to trigger Event Grid -> Service Bus queue messages.
3. Samples every 15 seconds:
   - Service Bus queue depth (active + in-flight messages)
   - Azure Container Apps active worker replica count
   - Processed jobs count
4. Logs telemetry to a CSV file (scale_test_results.csv).
5. Reports peak replica count, scale-up latency, and total drain time.
"""

from __future__ import annotations

import argparse
import csv
from datetime import datetime
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

REPO_ROOT = Path(__file__).resolve().parent.parent

TEST_PDF_BYTES = (
    b"%PDF-1.4\n"
    b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
    b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
    b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n"
    b"4 0 obj\n<< /Length 53 >>\nstream\nBT /F1 12 Tf 72 712 Td (Credenviel Scale Test Certificate) ET\nendstream\nendobj\n"
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


def wait_for_api(api_url: str, max_wait_sec: int = 35) -> bool:
    """Wait for API server to become ready."""
    deadline = time.time() + max_wait_sec
    while time.time() < deadline:
        if check_api_health(api_url):
            return True
        time.sleep(1.0)
    return False


def run_az(cmd_args: list[str]) -> str:
    """Run an az CLI command safely and return trimmed stdout."""
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
            timeout=15,
        )
        if res.returncode == 0:
            return res.stdout.strip()
    except Exception:
        pass
    return ""


def discover_resource_names(rg: str) -> tuple[str, str]:
    """Discover Service Bus namespace and Worker Container App names."""
    sb_namespace = run_az([
        "servicebus", "namespace", "list",
        "-g", rg,
        "--query", "[0].name",
        "-o", "tsv",
    ])
    worker_app = run_az([
        "containerapp", "list",
        "-g", rg,
        "--query", "[?contains(name, 'worker')].name | [0]",
        "-o", "tsv",
    ])
    return sb_namespace, worker_app


def get_queue_depth(rg: str, sb_namespace: str, queue_name: str = "job-processing") -> int:
    """Query current Service Bus active message count."""
    if not sb_namespace:
        return -1
    out = run_az([
        "servicebus", "queue", "show",
        "-g", rg,
        "--namespace-name", sb_namespace,
        "--name", queue_name,
        "--query", "countDetails.activeMessageCount",
        "-o", "tsv",
    ])
    try:
        return int(out)
    except (ValueError, TypeError):
        return -1


def get_replica_count(rg: str, worker_app: str) -> int:
    """Query current Container App worker active replica count."""
    if not worker_app:
        return -1
    out = run_az([
        "containerapp", "replica", "list",
        "-g", rg,
        "--name", worker_app,
        "--query", "length(@)",
        "-o", "tsv",
    ])
    try:
        return int(out)
    except (ValueError, TypeError):
        return -1


def create_and_upload_job(api_url: str, job_idx: int) -> dict | None:
    """Create a single job and upload PDF to Blob Storage."""
    req_body = json.dumps({
        "filename": f"scale_test_{job_idx:03d}.pdf",
        "content_type": "application/pdf",
        "size_bytes": len(TEST_PDF_BYTES),
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{api_url}/api/v1/jobs",
        data=req_body,
        headers={
            "Content-Type": "application/json",
            "X-Dev-User": f"student-scale-{job_idx}",
            "X-Dev-Role": "student",
            "X-Dev-Name": f"Scale Test Student {job_idx}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            if resp.status != 201:
                return None
            job_data = json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None

    upload_info = job_data.get("upload", {})
    upload_url = upload_info.get("url")
    if not upload_url:
        return None

    upload_headers = {
        "Content-Type": "application/pdf",
        "x-ms-blob-type": "BlockBlob",
    }
    if "headers" in upload_info and isinstance(upload_info["headers"], dict):
        upload_headers.update(upload_info["headers"])

    up_req = urllib.request.Request(
        upload_url,
        data=TEST_PDF_BYTES,
        headers=upload_headers,
        method="PUT",
    )
    try:
        with urllib.request.urlopen(up_req, timeout=30) as resp:
            if resp.status in (200, 201):
                return job_data
    except Exception:
        return None

    return None


def get_job_status(api_url: str, job_id: str) -> str:
    """Fetch status for a specific job."""
    try:
        req = urllib.request.Request(
            f"{api_url}/api/v1/jobs/{job_id}",
            headers={
                "X-Dev-User": "admin-verifier",
                "X-Dev-Role": "issuer",
                "X-Dev-Name": "Admin Verifier",
            },
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode("utf-8"))
                return data.get("status", "unknown")
    except Exception:
        pass
    return "unknown"


def run_scale_test(
    api_url: str,
    resource_group: str,
    jobs_count: int = 25,
    interval: int = 15,
    output_csv: Path | None = None,
    timeout: int = 600,
) -> int:
    """Execute the 25-job scale verification test and log telemetry."""
    target_csv = output_csv or (REPO_ROOT / "scale_test_results.csv")

    print("======================================================================")
    print("Credenviel Azure KEDA Auto-Scaling Verification Test")
    print("======================================================================")
    print(f"Target API URL:    {api_url}")
    print(f"Resource Group:    {resource_group}")
    print(f"Burst Jobs Count:  {jobs_count}")
    print(f"Sample Interval:   {interval}s")
    print(f"Output Telemetry:  {target_csv}")
    print("======================================================================")

    # 0. Check API health
    if not check_api_health(api_url):
        print(f"\n[!] Error: API at {api_url} is not responding.")
        print("    Ensure the API server is running with Azure environment:")
        print("    Run in a separate terminal: make run-api-azure")
        print("    Or pass --start-api to let this script launch the API server.")
        return 1

    # 1. Discover Azure resource names
    print("\n[*] Discovering Azure resources...")
    sb_ns, worker_app = discover_resource_names(resource_group)
    print(f"  Service Bus Namespace: {sb_ns or '(Not found / az cli unavailable)'}")
    print(f"  Worker Container App:  {worker_app or '(Not found / az cli unavailable)'}")

    # 2. Check initial cold state
    init_replicas = get_replica_count(resource_group, worker_app)
    init_depth = get_queue_depth(resource_group, sb_ns)
    print(f"[*] Pre-burst baseline: active replicas={init_replicas}, queue depth={init_depth}")

    # 3. Create burst of jobs in parallel
    print(f"\n[*] Submitting {jobs_count} jobs concurrently...")
    burst_start = time.time()
    created_jobs: list[str] = []

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [
            pool.submit(create_and_upload_job, api_url, i + 1)
            for i in range(jobs_count)
        ]
        for f in as_completed(futures):
            res = f.result()
            if res and "job_id" in res:
                created_jobs.append(res["job_id"])

    burst_duration = time.time() - burst_start
    print(f"[+] Successfully queued {len(created_jobs)}/{jobs_count} jobs in {burst_duration:.1f}s.")

    if not created_jobs:
        print("[!] No jobs were created successfully. Aborting scale test.")
        return 1

    # 4. Initialize CSV telemetry log
    with open(target_csv, "w", newline="", encoding="utf-8") as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow([
            "timestamp",
            "elapsed_sec",
            "queue_depth",
            "active_replicas",
            "processed_jobs",
            "total_jobs",
        ])

    print("\n[*] Monitoring scale telemetry every 15 seconds...")
    print(f"{'Time':<10} {'Elapsed':<8} {'Queue':<8} {'Replicas':<10} {'Processed':<12} {'Status'}")
    print("-" * 65)

    peak_replicas = max(0, init_replicas)
    time_to_scale: float | None = None
    start_monitor = time.time()
    deadline = start_monitor + timeout

    processed_count = 0
    while time.time() < deadline:
        elapsed = time.time() - start_monitor
        depth = get_queue_depth(resource_group, sb_ns)
        replicas = get_replica_count(resource_group, worker_app)

        if replicas > peak_replicas:
            peak_replicas = replicas
            if time_to_scale is None and replicas > init_replicas:
                time_to_scale = elapsed

        # Check job statuses
        processed_count = 0
        for jid in created_jobs:
            st = get_job_status(api_url, jid)
            if st == "processed":
                processed_count += 1

        now_str = datetime.now().strftime("%H:%M:%S")
        print(
            f"{now_str:<10} {elapsed:<8.1f} {str(depth):<8} "
            f"{str(replicas):<10} {f'{processed_count}/{len(created_jobs)}':<12} Active"
        )

        with open(target_csv, "a", newline="", encoding="utf-8") as csvfile:
            writer = csv.writer(csvfile)
            writer.writerow([
                datetime.now().isoformat(),
                f"{elapsed:.1f}",
                depth,
                replicas,
                processed_count,
                len(created_jobs),
            ])

        # If all processed and queue drained, test complete
        if processed_count == len(created_jobs) and depth in (0, -1):
            print("\n[+] All jobs processed and queue fully drained!")
            break

        time.sleep(interval)

    total_test_time = time.time() - start_monitor

    print("\n======================================================================")
    print("Scale Test Summary Results:")
    print("======================================================================")
    print(f"  Total Jobs Submitted:     {len(created_jobs)}")
    print(f"  Total Processed:          {processed_count}/{len(created_jobs)}")
    print(f"  Initial Cold Replicas:    {init_replicas}")
    print(f"  Peak Worker Replicas:     {peak_replicas}")
    print(f"  Time to Scale (0 -> N):   {f'{time_to_scale:.1f}s' if time_to_scale else 'N/A'}")
    print(f"  Total Pipeline Drain:     {total_test_time:.1f}s")
    print(f"  Telemetry Log Saved:      {target_csv}")
    print("======================================================================")
    return 0 if processed_count == len(created_jobs) else 1


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Credenviel KEDA Scale Verification Test (25 Burst Jobs)"
    )
    parser.add_argument(
        "--api-url",
        default=os.getenv("PUBLIC_BASE_URL", "http://127.0.0.1:8085"),
        help="Base URL for the Go API server (default: http://127.0.0.1:8085)",
    )
    parser.add_argument(
        "--resource-group",
        "-g",
        default=os.getenv("AZURE_RESOURCE_GROUP", "rg-credenviel-dev"),
        help="Azure Resource Group (default: rg-credenviel-dev)",
    )
    parser.add_argument(
        "--jobs-count",
        "-n",
        type=int,
        default=25,
        help="Number of burst jobs to submit (default: 25)",
    )
    parser.add_argument(
        "--interval",
        type=int,
        default=15,
        help="Sampling interval in seconds (default: 15)",
    )
    parser.add_argument(
        "--output-csv",
        type=Path,
        default=REPO_ROOT / "scale_test_results.csv",
        help="Output CSV telemetry path (default: scale_test_results.csv)",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=600,
        help="Maximum total test duration in seconds (default: 600)",
    )
    parser.add_argument(
        "--start-api",
        action="store_true",
        help="Automatically launch Go API server with Azure env in background if not running",
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

        code = run_scale_test(
            api_url=args.api_url,
            resource_group=args.resource_group,
            jobs_count=args.jobs_count,
            interval=args.interval,
            output_csv=args.output_csv,
            timeout=args.timeout,
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
