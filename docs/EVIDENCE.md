# Evidence — Screenshots, Demo Script & Load-Test Results

> This document is a template. Fill in the tables and attach screenshots as evidence is collected.

---

## Screenshots to Capture

| # | Screenshot | Captured? | File |
|---|---|---|---|
| 1 | AI Studio: sample certificates labeled for the custom Document Intelligence model | ☐ | |
| 2 | AI Studio: trained model's test run showing per-field confidence | ☐ | |
| 3 | Issuer dashboard: bulk upload in progress | ☐ | |
| 4 | Issuer dashboard: review screen resolving a `needs_review` flag | ☐ | |
| 5 | Container Apps replica count scaling from 0 to N during a burst (Azure portal or Monitor) | ☐ | |
| 6 | Service Bus queue-depth graph during the same burst | ☐ | |
| 7 | Public verification page: QR-code lookup result | ☐ | |

---

## Demo Script

1. Show the issuer dashboard at rest — zero workers running, empty queue.
2. Trigger a burst (the load-test script) and narrate the KEDA scale-out live against the replica-count graph.
3. Open one `needs_review` record and resolve it from the issuer review screen.
4. Scan the QR code on a sample digitized certificate and show the verification page matching the hash and fields.
5. Show the dashboard updating live via SignalR, no page refresh.
6. Close on the cost picture: zero-replica baseline versus the burst, tying back to the budget section.

---

## Load-Test Results

> **Target:** p95 time from upload to `processed` under 5 minutes for a 500-upload burst from a cold, zero-replica start (with stub extractor).

### Run 1

| Metric | Value |
|---|---|
| Date | |
| Number of uploads | |
| Extractor mode | stub / real |
| Starting replicas | |
| Peak replicas | |
| Time to first replica (KEDA 0→1) | |
| Time to peak replicas | |
| p50 upload-to-processed latency | |
| p95 upload-to-processed latency | |
| Cold-start cost (first job latency) | |
| Dead-lettered messages | |
| Failed jobs | |
| Notes | |

### Run 2

| Metric | Value |
|---|---|
| Date | |
| Number of uploads | |
| Extractor mode | stub / real |
| Starting replicas | |
| Peak replicas | |
| Time to first replica (KEDA 0→1) | |
| Time to peak replicas | |
| p50 upload-to-processed latency | |
| p95 upload-to-processed latency | |
| Cold-start cost (first job latency) | |
| Dead-lettered messages | |
| Failed jobs | |
| Notes | |

---

## Real Extraction Results (Small Sample)

| # | Document | Fields extracted | Lowest confidence field | Confidence | `needs_review`? | Notes |
|---|---|---|---|---|---|---|
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |
| 4 | | | | | | |
| 5 | | | | | | |
