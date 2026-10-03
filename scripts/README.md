# Load-Test Scripts

This directory contains the load-test script for the burst test.

## What the load-test script must record

- **p50 latency:** median time from upload to `processed` status
- **p95 latency:** 95th percentile time from upload to `processed` status
- **KEDA 0→peak time:** time from first message enqueued to peak replica count reached
- **Peak replicas:** maximum number of worker replicas observed
- **Cold-start cost:** latency of the first job (includes container image pull and startup)
- **Dead-lettered messages:** count of messages that landed in the DLQ
- **Failed jobs:** count of jobs that ended in `failed` status

## Target

p95 < 5 minutes for a 500-upload burst from a cold, zero-replica start (with stub extractor).

## Usage

```bash
# TODO: Implement
# python load_test.py --uploads 500 --stub-extractor
```
