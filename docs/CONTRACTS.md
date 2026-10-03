# Interface Contracts

> **Status convention:** each contract is marked **PROPOSED** until reviewed and approved by a human.
> These contracts define the boundaries between services. All changes must be coordinated across teams.

---

## 1. Service Bus Message Schema

**Status: PROPOSED, needs human review**

**Queue name:** `job-processing`

**Message body:**
```json
{
  "job_id": "<uuid>"
}
```

Only the `job_id` is sent. The worker looks up all other details (blob_key, uploader, etc.) from PostgreSQL. This keeps the message small and avoids stale data if the job row is updated between enqueue and dequeue.

**Dead-letter behavior:**
- Service Bus moves a message to the dead-letter queue (DLQ) after the configured max delivery count (propose: 5).
- An Azure Monitor alert fires on any message landing in the DLQ.
- The failed-job mechanism (who sets `jobs.status = 'failed'` after dead-lettering) is an open decision — see [DECISIONS.md](DECISIONS.md).

---

## 2. Blob Container Names & Path Format

**Status: PROPOSED, needs human review**

| Container | Purpose | Watched by Event Grid? |
|---|---|---|
| `raw-uploads` | Incoming certificate scans | **Yes** — blob-created event filtered to this container only |

**Blob path format:**
```
raw-uploads/{job_id}/{original_filename}
```

The `job_id` is embedded in the path so the Function can extract it from the blob URL without a database lookup. The SAS token is scoped to this exact path.

---

## 3. Job Status State Machine

**Status: PROPOSED, needs human review**

```mermaid
stateDiagram-v2
    [*] --> awaiting_upload : API creates job
    awaiting_upload --> queued : Function validates blob
    awaiting_upload --> failed : Cleanup Function (SAS expired, no upload)
    queued --> processing : Worker picks up message
    processing --> processed : Worker completes extraction (all fields above threshold)
    processing --> needs_review : Worker completes extraction (any field below threshold)
    processing --> failed : Worker error / DLQ
    needs_review --> processed : Issuer resolves review
    failed --> [*]
    processed --> [*]
```

| Transition | Component | Notes |
|---|---|---|
| `→ awaiting_upload` | Go API | Job row created, SAS token issued |
| `awaiting_upload → queued` | Azure Function | Blob validated (type + size), message enqueued |
| `awaiting_upload → failed` | Cleanup Function | SAS expired without completed upload |
| `queued → processing` | Python Worker | Message dequeued, processing begins |
| `processing → processed` | Python Worker | All fields above confidence threshold |
| `processing → needs_review` | Python Worker | Any field below confidence threshold |
| `processing → failed` | Python Worker / DLQ | Unrecoverable error or max retries exceeded |
| `needs_review → processed` | Go API (issuer action) | Issuer confirms or corrects fields |

---

## 4. REST Endpoints — Go API

**Status: PROPOSED, needs human review**

### Public (no auth)

| Method | Path | Description |
|---|---|---|
| `GET` | `/healthz` | Health check |
| `GET` | `/api/v1/verify/:publicVerificationId` | Public verification page data |

### Student (requires `Student` role)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/jobs` | Request an upload (creates job, returns SAS token) |
| `GET` | `/api/v1/jobs` | List own jobs (filtered by `uploader_id`) |
| `GET` | `/api/v1/jobs/:id` | Get own job detail |

### Issuer (requires `Issuer` role)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/jobs` | Request an upload (same endpoint, role determines `verified_by_issuer` auto-set) |
| `GET` | `/api/v1/jobs` | List all jobs |
| `GET` | `/api/v1/jobs/:id` | Get any job detail |
| `POST` | `/api/v1/jobs/bulk` | Bulk upload (create multiple jobs) |
| `GET` | `/api/v1/review` | List jobs needing review |
| `POST` | `/api/v1/review/:jobId` | Resolve a `needs_review` flag or confirm a student upload |
| `DELETE` | `/api/v1/jobs/:id` | Delete a job (admin action on student's explicit request) |

### Internal (worker → API, not externally exposed)

| Method | Path | Description |
|---|---|---|
| `POST` | `/internal/v1/jobs/:id/status` | Worker updates job status + triggers SignalR push |

### Auth

| Endpoint group | Auth requirement |
|---|---|
| Public | None |
| Student | Entra JWT with `Student` role in `roles` claim |
| Issuer | Entra JWT with `Issuer` role in `roles` claim |
| Internal | Shared secret or managed identity (not user-facing) |

### SignalR negotiate

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/signalr/negotiate` | Returns SignalR connection info for the authenticated user |

---

## 5. Normalization Rule for `fields_hash`

**Status: PROPOSED, needs human review**

The `fields_hash` is a SHA-256 digest of the **canonical JSON** representation of extracted fields, computed as follows:

1. Build a JSON object with the extracted fields: `name`, `roll_number`, `register_number`, `marks_json`, `cgpa`, `issue_date`.
2. **Sort keys** alphabetically at all levels.
3. **Trim** all string values (remove leading/trailing whitespace).
4. **Case-fold** all string values to lowercase.
5. **Fixed number format:** represent all numbers without trailing zeros (e.g., `3.5` not `3.50`).
6. **Fixed date format:** `YYYY-MM-DD` (ISO 8601).
7. **Marks JSON:** each entry sorted by subject key, values as trimmed/case-folded strings.
8. Serialize with no extra whitespace (compact JSON).
9. Compute SHA-256 of the resulting UTF-8 byte string.

This ensures the same extracted data always produces the same hash, regardless of formatting differences.

---

## 6. SignalR

**Status: PROPOSED, needs human review**

- **Service mode:** Serverless (Azure SignalR Service, not self-hosted).
- **One group per user ID:** each authenticated user joins a group named after their `user_id`.
- **Who pushes:** the Go API pushes to SignalR via the SignalR Service REST API after receiving a status update from the worker's internal endpoint call.
- **Negotiate endpoint:** `POST /api/v1/signalr/negotiate` — returns the SignalR connection URL and access token for the authenticated user.
- **Message format:**
```json
{
  "target": "jobStatusUpdate",
  "arguments": [{
    "job_id": "<uuid>",
    "status": "<new_status>",
    "updated_at": "<ISO 8601 timestamp>"
  }]
}
```

---

## 7. Confidence Threshold

**Status: PROPOSED, needs human review**

- **Starting value:** `0.85` (85%)
- **Configuration:** environment variable `CONFIDENCE_THRESHOLD`, not hardcoded.
- **Behavior:** if any field's confidence score falls below this threshold, the job is flagged as `needs_review`.
- **Tuning:** this value is a parameter to sweep during testing against the trained model, not a fixed guess.

---

## 8. Public Verification Page

**Status: PROPOSED, needs human review**

### Public Fields (shown on the verification page)

| Field | Shown? |
|---|---|
| `name` | ✅ Yes |
| `roll_number` | ✅ Yes |
| `degree` | ✅ Yes (derived from document type if available) |
| `issue_date` | ✅ Yes |
| `source_hash` | ✅ Yes |
| `fields_hash` | ✅ Yes |
| `verified_by_issuer` | ✅ Yes |
| `marks_json` (full marks) | ❌ **No** — only summary (e.g., CGPA) is shown |
| `register_number` | ❌ No — not public |
| `confidence_json` | ❌ No — internal |

### Rate Limiting

- Rate limit on the public verification endpoint to prevent scraping.
- Propose: 30 requests per minute per IP.
- Consider CAPTCHA for repeated lookups from the same IP.
