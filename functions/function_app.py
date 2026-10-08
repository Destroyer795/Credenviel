"""
blob_created — Event Grid trigger for blob-created events on the raw-uploads container.

Validates uploaded blobs and transitions jobs to 'queued', enqueuing messages on Service Bus.
"""

from __future__ import annotations

import json
import logging
import os
import urllib.parse
from typing import Any

import psycopg

try:
    from functions.core import (
        FunctionDeps,
        HandleResult,
        handle_blob_created,
        handle_scheduled_cleanup,
        handle_dead_letter,
    )
except ImportError:
    from core import (
        FunctionDeps,
        HandleResult,
        handle_blob_created,
        handle_scheduled_cleanup,
        handle_dead_letter,
    )

# Cached store and queue clients across invocations
_cached_store: Any = None
_cached_servicebus_queue: Any = None

logger = logging.getLogger("functions.blob_created")


def get_db_connection() -> psycopg.Connection:
    """Create a new PostgreSQL connection from environment configuration."""
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        return psycopg.connect(database_url, autocommit=True)

    host = os.getenv("PGHOST", "localhost")
    port = os.getenv("PGPORT", "5432")
    user = os.getenv("PGUSER", "credenviel")
    password = os.getenv("PGPASSWORD", "")
    dbname = os.getenv("PGDATABASE", "credenviel")
    sslmode = os.getenv("PGSSLMODE", "require" if host != "localhost" else "prefer")

    return psycopg.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        dbname=dbname,
        sslmode=sslmode,
        autocommit=True,
    )


def get_store() -> Any:
    """Get or initialize the storage backend."""
    global _cached_store
    if _cached_store is None:
        store_backend = os.getenv(
            "STORE_BACKEND",
            "blob" if os.getenv("STORAGE_ACCOUNT_NAME") else "local",
        )
        if store_backend == "blob":
            from credenviel_shared.blob_store import BlobStore

            _cached_store = BlobStore(
                storage_account_name=os.getenv("STORAGE_ACCOUNT_NAME"),
                managed_identity_client_id=os.getenv("AZURE_CLIENT_ID") or None,
            )
        else:
            from credenviel_shared.store import LocalFileStore

            _cached_store = LocalFileStore(os.getenv("LOCAL_STORAGE_ROOT", ".local-storage"))
    return _cached_store


def get_queue(conn: psycopg.Connection | None = None) -> Any:
    """Get or initialize the queue backend."""
    global _cached_servicebus_queue
    queue_backend = os.getenv(
        "QUEUE_BACKEND",
        "servicebus" if os.getenv("SERVICEBUS_FQDN") else "local",
    )
    if queue_backend == "servicebus":
        if _cached_servicebus_queue is None:
            from credenviel_shared.service_bus_queue import ServiceBusQueue

            _cached_servicebus_queue = ServiceBusQueue(
                fully_qualified_namespace=os.getenv("SERVICEBUS_FQDN"),
                queue_name=os.getenv("SERVICEBUS_QUEUE", "job-processing"),
                managed_identity_client_id=os.getenv("AZURE_CLIENT_ID") or None,
            )
        return _cached_servicebus_queue

    if conn is None:
        raise ValueError("LocalQueue requires an active database connection")
    from credenviel_shared.local_queue import LocalQueue

    return LocalQueue(conn)


def extract_blob_key(data: dict, subject: str = "") -> str:
    """Extract and normalize blob_key from Event Grid event data or subject.

    Expected return format: raw-uploads/{job_id}/{filename}
    """
    blob_url = data.get("url") or data.get("blobUrl", "")
    if blob_url:
        parsed = urllib.parse.urlparse(blob_url)
        clean_path = urllib.parse.unquote(parsed.path.lstrip("/"))
        if clean_path.startswith("raw-uploads/"):
            return clean_path

    if subject:
        # Subject format: /blobServices/default/containers/raw-uploads/blobs/{job_id}/{filename}
        clean_subj = urllib.parse.unquote(subject)
        if "containers/raw-uploads/blobs/" in clean_subj:
            subpath = clean_subj.split("containers/raw-uploads/blobs/")[1]
            return f"raw-uploads/{subpath}"
        if clean_subj.lstrip("/").startswith("raw-uploads/"):
            return clean_subj.lstrip("/")

    return ""


def process_blob_event(
    data: dict,
    subject: str = "",
    deps: FunctionDeps | None = None,
) -> HandleResult:
    """Process an Event Grid blob created event.

    Extracts the blob key, validates the blob and job status, updates PostgreSQL,
    and enqueues the processing message.
    """
    blob_key = extract_blob_key(data, subject)
    if not blob_key:
        logger.warning(
            "Event missing valid raw-uploads blob path: data=%s subject=%s",
            data,
            subject,
        )
        return HandleResult(action="no_op", reason="unrecognized_blob_path")

    logger.info("Processing blob_created for key: %s", blob_key)

    if deps is not None:
        return handle_blob_created(blob_key, deps)

    max_bytes = int(os.getenv("MAX_UPLOAD_BYTES", "4194304"))
    with get_db_connection() as conn:
        store = get_store()
        queue = get_queue(conn)
        call_deps = FunctionDeps(
            conn=conn,
            store=store,
            queue=queue,
            max_upload_bytes=max_bytes,
        )
        result = handle_blob_created(blob_key, call_deps)
        logger.info(
            "handle_blob_created completed: action=%s job_id=%s reason=%s",
            result.action,
            result.job_id,
            result.reason,
        )
        return result


def process_cleanup_event(max_age_minutes: int = 15, conn: psycopg.Connection | None = None) -> list[str]:
    """Testable helper to run scheduled cleanup of expired awaiting_upload jobs."""
    if conn is not None:
        return handle_scheduled_cleanup(conn, max_age_minutes=max_age_minutes)
    with get_db_connection() as db_conn:
        return handle_scheduled_cleanup(db_conn, max_age_minutes=max_age_minutes)


def process_dead_letter_event(
    message_body: dict | str,
    diagnostic_reason: str = "dead_letter_exceeded_retries",
    conn: psycopg.Connection | None = None,
) -> HandleResult:
    """Testable helper to process a dead-lettered message."""
    if conn is not None:
        return handle_dead_letter(conn, message_body, diagnostic_reason=diagnostic_reason)
    with get_db_connection() as db_conn:
        return handle_dead_letter(db_conn, message_body, diagnostic_reason=diagnostic_reason)


# Azure Functions v4 programming model entrypoint
try:
    import azure.functions as func

    app = func.FunctionApp()

    @app.function_name(name="BlobCreatedTrigger")
    @app.event_grid_trigger(arg_name="event")
    def blob_created(event: func.EventGridEvent) -> None:
        """Handle blob-created events from the raw-uploads container."""
        logger.info("BlobCreatedTrigger fired: id=%s type=%s subject=%s", event.id, event.event_type, event.subject)

        data = {}
        if hasattr(event, "get_json"):
            try:
                data = event.get_json()
            except Exception:
                pass
        if not data and hasattr(event, "get_body"):
            try:
                raw_body = event.get_body()
                if raw_body:
                    data = json.loads(raw_body.decode("utf-8"))
            except Exception:
                pass

        if not isinstance(data, dict):
            data = {}

        process_blob_event(data, subject=getattr(event, "subject", "") or "")

    @app.function_name(name="ScheduledCleanupTrigger")
    @app.timer_trigger(
        arg_name="timer",
        schedule=os.getenv("CLEANUP_CRON_SCHEDULE", "0 */15 * * * *"),
        run_on_startup=False,
    )
    def scheduled_cleanup(timer: func.TimerRequest) -> None:
        """Scan PostgreSQL for abandoned awaiting_upload jobs and transition them to failed."""
        logger.info("ScheduledCleanupTrigger fired")
        try:
            max_age = int(os.getenv("SAS_EXPIRY_MINUTES", "15"))
            cleaned = process_cleanup_event(max_age_minutes=max_age)
            logger.info("ScheduledCleanupTrigger completed: expired %d jobs", len(cleaned))
        except Exception as e:
            logger.exception("ScheduledCleanupTrigger error: %s", e)

    @app.function_name(name="DeadLetterTrigger")
    @app.service_bus_queue_trigger(
        arg_name="msg",
        queue_name=os.getenv("SERVICEBUS_QUEUE", "job-processing") + "/$deadletterqueue",
        connection="SERVICEBUS_CONNECTION",
    )
    def dead_letter_handler(msg: func.ServiceBusMessage) -> None:
        """Handle poison messages from Service Bus dead-letter queue."""
        delivery_count = getattr(msg, "delivery_count", 5)
        logger.warning(
            "DeadLetterTrigger intercepted message: id=%s delivery_count=%s",
            msg.message_id,
            delivery_count,
        )
        try:
            raw_body = msg.get_body().decode("utf-8") if msg.get_body() else "{}"
            reason = f"poison_message_delivery_count_{delivery_count}"
            res = process_dead_letter_event(raw_body, diagnostic_reason=reason)
            logger.info("DeadLetterTrigger outcome: action=%s job_id=%s reason=%s", res.action, res.job_id, res.reason)
        except Exception as e:
            logger.exception("DeadLetterTrigger failed processing poison message: %s", e)

except ImportError:
    # Running outside azure-functions runtime (e.g. local unit tests)
    app = None

