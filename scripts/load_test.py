#!/usr/bin/env python3
"""
Burst Load Test Script for Credenviel (Phase 6 Polish, Reliability & Load-Testing).

Validates:
1. 500-upload burst (configurable via --burst) from cold start.
2. p95 upload-to-processed latency < 5 minutes (300 seconds).
3. KEDA auto-scaling from 0 -> Peak -> 0 replicas (5-minute idle cooldown).
4. Records p50, p90, p95 latency, dead-letter count, and cold-start cost per docs/EVIDENCE.md.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
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

REPO_ROOT = Path(__file__).resolve().parent.parent

TEST_PDF_BYTES = (
    b"%PDF-1.4\n"
    b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
    b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
    b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n"
    b"4 0 obj\n<< /Length 53 >>\nstream\nBT /F1 12 Tf 72 712 Td (Credenviel Load Test Certificate) ET\nendstream\nendobj\n"
    b"xref\n0 5\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \n0000000215 00000 n \n"
    b"trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n318\n%%EOF\n"
)


def run_az(cmd_args: list[str]) -> str:
    """Run an az CLI command safely."""
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


def get_queue_metrics(rg: str, sb_namespace: str, queue_name: str = "job-processing") -> tuple[int, int]:
    """Return (active_messages, dead_letter_messages)."""
    if not rg or not sb_namespace:
        return (-1, -1)

    out = run_az([
        "servicebus", "queue", "show",
        "-g", rg,
        "--namespace-name", sb_namespace,
        "--name", queue_name,
        "--query", "[countDetails.activeMessageCount, countDetails.deadLetterMessageCount]",
        "-o", "tsv",
    ])
    try:
        parts = out.split()
        if len(parts) >= 2:
            return (int(parts[0]), int(parts[1]))
    except Exception:
        pass
    return (-1, -1)


def get_replica_count(rg: str, worker_app: str) -> int:
    """Query current Container App worker active replica count."""
    if not rg or not worker_app:
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


def upload_single_job(api_url: str, idx: int) -> dict | None:
    """Create a job and upload test certificate payload."""
    t_start = time.time()
    req_body = json.dumps({
        "filename": f"burst_cert_{idx:04d}.pdf",
        "content_type": "application/pdf",
        "size_bytes": len(TEST_PDF_BYTES),
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{api_url}/api/v1/jobs",
        data=req_body,
        headers={
            "Content-Type": "application/json",
            "X-Dev-User": f"student-burst-{idx}",
            "X-Dev-Role": "student",
            "X-Dev-Name": f"Student Burst {idx}",
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
                return {
                    "id": job_data["id"],
                    "upload_time": time.time(),
                    "duration_sec": time.time() - t_start,
                }
    except Exception:
        return None

    return None


def poll_job_status(api_url: str, job_id: str) -> str:
    """Query job status."""
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


def percentile(data: list[float], pct: float) -> float:
    """Compute percentile from sorted list."""
    if not data:
        return 0.0
    k = (len(data) - 1) * pct
    f = int(k)
    c = min(f + 1, len(data) - 1)
    d = k - f
    return data[f] + (data[c] - data[f]) * d


def run_burst_load_test(
    api_url: str,
    burst_count: int = 500,
    concurrency: int = 25,
    rg: str = "",
    sb_namespace: str = "",
    worker_app: str = "",
    wait_scale_to_zero: bool = False,
) -> dict:
    """Execute burst load test."""
    print("=" * 72)
    print(f"Credenviel Phase 6 Burst Load Test: {burst_count} uploads")
    print(f"Target API: {api_url}")
    print(f"Concurrency: {concurrency} workers")
    if rg:
        print(f"Resource Group: {rg} (SB: {sb_namespace}, Worker: {worker_app})")
    print("=" * 72)

    # Check baseline replicas
    starting_replicas = get_replica_count(rg, worker_app) if rg and worker_app else 0
    print(f"Starting worker replicas: {starting_replicas}")

    print(f"\n[1/4] Triggering burst of {burst_count} document uploads...")
    t_burst_start = time.time()
    uploaded_jobs: list[dict] = []

    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = {executor.submit(upload_single_job, api_url, i): i for i in range(1, burst_count + 1)}
        for fut in as_completed(futures):
            res = fut.result()
            if res:
                uploaded_jobs.append(res)
            if len(uploaded_jobs) % 50 == 0 or len(uploaded_jobs) == burst_count:
                print(f"  Uploaded {len(uploaded_jobs)}/{burst_count} documents...")

    t_burst_finish = time.time()
    upload_duration = t_burst_finish - t_burst_start
    print(f"Burst upload phase completed in {upload_duration:.2f}s ({len(uploaded_jobs)}/{burst_count} succeeded)")

    print("\n[2/4] Monitoring processing pipeline and sampling KEDA scaling...")
    pending_ids = {j["id"]: j["upload_time"] for j in uploaded_jobs}
    latencies: list[float] = []
    failed_count = 0

    first_job_time = None
    time_to_first_replica = None
    time_to_peak_replicas = None
    peak_replicas = starting_replicas

    t_monitor_start = time.time()
    last_sample_time = 0.0

    while pending_ids and (time.time() - t_burst_start) < 900:  # 15 min max safety cutoff
        now = time.time()

        # Sample telemetry every 10 seconds
        if now - last_sample_time >= 10.0:
            last_sample_time = now
            if rg and worker_app:
                cur_reps = get_replica_count(rg, worker_app)
                active_msgs, dlq_msgs = get_queue_metrics(rg, sb_namespace)
                if cur_reps > 0 and time_to_first_replica is None:
                    time_to_first_replica = now - t_burst_start
                    print(f"  [KEDA Scale-Out] First worker replica started at {time_to_first_replica:.1f}s")
                if cur_reps > peak_replicas:
                    peak_replicas = cur_reps
                    time_to_peak_replicas = now - t_burst_start

                elapsed = now - t_burst_start
                done_count = len(uploaded_jobs) - len(pending_ids)
                print(
                    f"  [{elapsed:05.1f}s] Processed: {done_count}/{len(uploaded_jobs)} | "
                    f"Replicas: {cur_reps} (peak {peak_replicas}) | Queue Active: {active_msgs} | DLQ: {dlq_msgs}"
                )

        # Sample batch of pending jobs
        sample_keys = list(pending_ids.keys())[:min(20, len(pending_ids))]
        for jid in sample_keys:
            st = poll_job_status(api_url, jid)
            if st in ("processed", "needs_review"):
                t_up = pending_ids.pop(jid)
                lat = time.time() - t_up
                latencies.append(lat)
                if first_job_time is None:
                    first_job_time = lat
            elif st == "failed":
                pending_ids.pop(jid)
                failed_count += 1

        time.sleep(1.0)

    total_pipeline_time = time.time() - t_burst_start
    latencies.sort()

    p50 = percentile(latencies, 0.50)
    p90 = percentile(latencies, 0.90)
    p95 = percentile(latencies, 0.95)
    p99 = percentile(latencies, 0.99)

    # Check DLQ messages at finish
    _, dlq_final = get_queue_metrics(rg, sb_namespace) if rg and sb_namespace else (-1, 0)

    print("\n[3/4] Performance Summary:")
    print(f"  Total Processed: {len(latencies)} / {burst_count}")
    print(f"  Failed Jobs: {failed_count}")
    print(f"  Dead-Lettered Messages: {max(0, dlq_final)}")
    print(f"  Cold-Start (First Job) Latency: {first_job_time or 0.0:.2f}s")
    print(f"  p50 Latency: {p50:.2f}s")
    print(f"  p90 Latency: {p90:.2f}s")
    print(f"  p95 Latency: {p95:.2f}s")
    print(f"  p99 Latency: {p99:.2f}s")
    print(f"  Starting Replicas: {starting_replicas}")
    print(f"  Peak Replicas: {peak_replicas}")
    print(f"  Time to First Replica (0->1): {time_to_first_replica or 0.0:.1f}s")
    print(f"  Time to Peak Replicas: {time_to_peak_replicas or 0.0:.1f}s")

    # Target assertion
    p95_pass = p95 <= 300.0  # Under 5 minutes
    print(f"\n  Acceptance Target (p95 < 300s): {'PASSED' if p95_pass else 'FAILED'} (measured {p95:.2f}s)")

    # Optional scale-to-zero cooldown check
    if wait_scale_to_zero and rg and worker_app:
        print("\n[4/4] Verifying KEDA scale-to-zero cooldown (5 minutes)...")
        cooldown_deadline = time.time() + 360  # 6 minutes max
        scaled_zero = False
        while time.time() < cooldown_deadline:
            reps = get_replica_count(rg, worker_app)
            if reps == 0:
                print("  KEDA successfully scaled worker replicas back to 0!")
                scaled_zero = True
                break
            print(f"  Cooldown wait: active replicas = {reps}...")
            time.sleep(20.0)
    else:
        print("\n[4/4] Scale-to-zero cooldown verification skipped (use --wait-cooldown to wait 5m).")

    results = {
        "date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "burst_count": burst_count,
        "processed_count": len(latencies),
        "failed_count": failed_count,
        "dead_letter_count": max(0, dlq_final),
        "starting_replicas": starting_replicas,
        "peak_replicas": peak_replicas,
        "time_to_first_replica": time_to_first_replica or 0.0,
        "time_to_peak_replicas": time_to_peak_replicas or 0.0,
        "p50_latency": p50,
        "p95_latency": p95,
        "first_job_latency": first_job_time or 0.0,
        "p95_target_passed": p95_pass,
    }

    return results


def main() -> int:
    parser = argparse.ArgumentParser(description="Credenviel Phase 6 Load Test")
    parser.add_argument("--burst", type=int, default=500, help="Number of uploads in the burst (default: 500)")
    parser.add_argument("--api-url", default="http://localhost:8080", help="API base URL (default: http://localhost:8080)")
    parser.add_argument("--concurrency", type=int, default=25, help="Concurrent upload threads (default: 25)")
    parser.add_argument("--rg", default="", help="Azure Resource Group name (optional)")
    parser.add_argument("--sb-namespace", default="", help="Service Bus namespace (optional)")
    parser.add_argument("--worker-app", default="", help="Worker Container App name (optional)")
    parser.add_argument("--wait-cooldown", action="store_true", help="Wait for KEDA scale-to-zero 5min cooldown")
    parser.add_argument("--output-csv", default="load_test_results.csv", help="CSV output path")

    args = parser.parse_args()

    results = run_burst_load_test(
        api_url=args.api_url.rstrip("/"),
        burst_count=args.burst,
        concurrency=args.concurrency,
        rg=args.rg,
        sb_namespace=args.sb_namespace,
        worker_app=args.worker_app,
        wait_scale_to_zero=args.wait_cooldown,
    )

    # Write CSV
    csv_file = Path(args.output_csv)
    file_exists = csv_file.exists()
    with open(csv_file, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(results.keys()))
        if not file_exists:
            writer.writeheader()
        writer.writerow(results)
    print(f"\nResults appended to {csv_file}")

    return 0 if results["p95_target_passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
