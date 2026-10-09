"""Job processing logic for certificate digitization worker."""

import hashlib
import json
import logging
from typing import Any, Callable
import urllib.error
import urllib.request
import uuid

import psycopg
from psycopg.types.json import Jsonb

from credenviel_shared.normalizer import compute_fields_hash, canonicalize_fields
from credenviel_shared.queue import Message, Queue
from credenviel_shared.store import Store
from worker.confidence import evaluate_confidence
from worker.extractor import Extractor
from worker.stamper import stamp_certificate

logger = logging.getLogger("worker.processor")


class FatalError(Exception):
    """Unrecoverable processing failure; causes job to fail permanently and message to complete."""
    pass


class SimulatedCrash(BaseException):
    """Simulates a worker dying abruptly (skips both abandon and complete)."""
    pass


class WorkerProcessor:
    """Processes messages from queue, performs extraction, hashing, and database persistence."""

    def __init__(
        self,
        conn: psycopg.Connection,
        queue: Queue,
        store: Store,
        extractor: Extractor,
        confidence_threshold: float = 0.85,
        api_internal_url: str = "http://localhost:8080",
        internal_api_key: str = "",
        # Test hooks:
        before_finalize: Callable[[uuid.UUID], None] | None = None,
        after_record_upsert: Callable[[uuid.UUID], None] | None = None,
        extractor_fault: Callable[[uuid.UUID], None] | None = None,
        database_url: str = "",
    ):
        self.conn = conn
        self.database_url = database_url
        self.queue = queue
        self.store = store
        self.extractor = extractor
        self.threshold = confidence_threshold
        self.api_internal_url = api_internal_url.rstrip("/")
        self.internal_api_key = internal_api_key

        self.before_finalize = before_finalize
        self.after_record_upsert = after_record_upsert
        self.extractor_fault = extractor_fault

    def ensure_connection(self) -> psycopg.Connection:
        """Verify the database connection is alive; reconnect automatically if closed or broken."""
        needs_reconnect = False
        if self.conn is None or getattr(self.conn, "closed", False):
            needs_reconnect = True
        else:
            try:
                with self.conn.cursor() as cur:
                    cur.execute("SELECT 1")
            except Exception:
                logger.warning("Database connection is closed or broken; reconnecting...")
                needs_reconnect = True
                try:
                    self.conn.close()
                except Exception:
                    pass

        if needs_reconnect:
            if not self.database_url:
                logger.warning("No database_url provided to WorkerProcessor for reconnect")
                return self.conn
            logger.info("Reconnecting to PostgreSQL database...")
            self.conn = psycopg.connect(self.database_url, autocommit=True)

        try:
            with self.conn.cursor() as cur:
                cur.execute("""
                    ALTER TABLE records ADD COLUMN IF NOT EXISTS document_type TEXT NOT NULL DEFAULT 'grade_sheet';
                    ALTER TABLE records ADD COLUMN IF NOT EXISTS attributes_json JSONB NOT NULL DEFAULT '{}'::jsonb;
                    CREATE INDEX IF NOT EXISTS idx_records_document_type ON records(document_type);

                    CREATE OR REPLACE FUNCTION check_status_transition()
                    RETURNS TRIGGER AS $$
                    BEGIN
                        IF NEW.status = OLD.status THEN
                            RETURN NEW;
                        END IF;

                        IF (OLD.status = 'awaiting_upload' AND NEW.status IN ('queued', 'failed')) OR
                           (OLD.status = 'queued' AND NEW.status IN ('processing', 'failed')) OR
                           (OLD.status = 'processing' AND NEW.status IN ('processed', 'needs_review', 'failed')) OR
                           (OLD.status = 'needs_review' AND NEW.status IN ('processed', 'failed')) THEN
                            RETURN NEW;
                        END IF;

                        RAISE EXCEPTION 'invalid status transition from % to %', OLD.status, NEW.status
                            USING ERRCODE = 'check_violation';
                    END;
                    $$ LANGUAGE plpgsql;
                """)
        except Exception as e:
            logger.debug("Schema verification notice: %s", e)

        return self.conn

    def process_message(self, message: Message) -> str:
        """Process a single queue message following docs/PHASE1_SPEC.md § 5.7.

        Returns the outcome action ("processed", "needs_review", "failed", "no_op", "abandoned").
        """
        self.ensure_connection()
        # 1. Parse and validate message body
        body = message.body
        if not isinstance(body, dict) or "job_id" not in body:
            logger.error("Malformed message body: %s; dead-lettering", body)
            self.queue.dead_letter(message, reason="CorruptBody")
            return "dead_lettered"

        try:
            job_id = uuid.UUID(str(body["job_id"]))
        except ValueError:
            logger.error("Invalid job UUID in message: %s; dead-lettering", body["job_id"])
            self.queue.dead_letter(message, reason="InvalidJobUUID")
            return "dead_lettered"

        # Check if job exists in database
        with self.conn.cursor() as cur:
            cur.execute(
                "SELECT status, blob_key, uploader_is_issuer FROM jobs WHERE id = %s",
                (job_id,),
            )
            row = cur.fetchone()

        if row is None:
            logger.error("Job %s not found in database; completing message", job_id)
            self.queue.complete(message)
            return "no_op"

        status, blob_key, uploader_is_issuer = row

        # 2. Check current status
        if status in ("processed", "needs_review", "failed"):
            logger.info("Job %s is already in final status '%s'; completing as no-op", job_id, status)
            self.queue.complete(message)
            return "no_op"

        if status == "awaiting_upload":
            logger.warning("Job %s is still 'awaiting_upload'; abandoning so it visible in DLQ if stuck", job_id)
            self.queue.abandon(message)
            return "abandoned"

        # 3. Transition to 'processing' in a separate transaction
        try:
            with self.conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE jobs
                    SET status = 'processing'
                    WHERE id = %s AND status IN ('queued', 'processing')
                    """,
                    (job_id,),
                )
            if not self.conn.autocommit:
                self.conn.commit()
        except Exception as e:
            logger.error("Failed to set status to 'processing' for job %s: %e", job_id, e)
            self.queue.abandon(message)
            return "abandoned"

        # 4. Stream file and compute source_hash, run extractor
        try:
            # Fatal error checks
            if not self.store.exists(blob_key):
                raise FatalError(f"file missing from storage: {blob_key}")

            file_size = self.store.size(blob_key)
            if file_size == 0:
                raise FatalError("file in storage is empty (0 bytes)")

            # Fault injection hook
            if self.extractor_fault:
                self.extractor_fault(job_id)

            # Compute source_hash (SHA-256 of raw bytes)
            hasher = hashlib.sha256()
            with self.store.open(blob_key) as f:
                while chunk := f.read(65536):
                    hasher.update(chunk)
            source_hash = hasher.hexdigest()

            # Run extractor
            with self.store.open(blob_key) as f:
                extraction = self.extractor.extract(f, blob_key)

            # Evaluate confidences
            all_passed, confidence_json = evaluate_confidence(
                extraction.field_confidences,
                extraction.marks_confidences,
                threshold=self.threshold,
            )

            # Canonical normalization & fields_hash (normalization applies only to hash calculation)
            raw_fields = extraction.fields
            fields_hash = compute_fields_hash(raw_fields)

            # Hook before finalize
            if self.before_finalize:
                self.before_finalize(job_id)

            extracted_fields = extraction.fields
            has_extracted_data = any(
                extracted_fields.get(field)
                for field in ("name", "roll_number", "register_number", "degree", "cgpa", "issue_date")
            ) or bool(extracted_fields.get("marks")) or bool(extracted_fields.get("attributes_json"))
            final_status = "processed" if all_passed and has_extracted_data else "needs_review"
            if not has_extracted_data:
                logger.warning("OCR returned no structured fields for job %s; routing to needs_review", job_id)

            # 5. One ACID transaction: SELECT FOR UPDATE, upsert record, update status
            with self.conn.transaction():
                with self.conn.cursor() as cur:
                    cur.execute(
                        "SELECT status FROM jobs WHERE id = %s FOR UPDATE",
                        (job_id,),
                    )
                    curr_status = cur.fetchone()[0]
                    if curr_status in ("processed", "needs_review", "failed"):
                        logger.info("Job %s was finalized concurrently by another worker; rolling back", job_id)
                        # Will roll back transaction and complete message below
                        final_status = "no_op"
                    else:
                        # Upsert record with raw extracted values (never overwrite public_verification_id or verified_by_issuer)
                        cur.execute(
                            """
                            INSERT INTO records (
                                job_id,
                                name,
                                roll_number,
                                register_number,
                                degree,
                                marks_json,
                                cgpa,
                                issue_date,
                                confidence_json,
                                source_hash,
                                fields_hash,
                                verified_by_issuer,
                                document_type,
                                attributes_json
                            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                            ON CONFLICT (job_id) DO UPDATE SET
                                name = EXCLUDED.name,
                                roll_number = EXCLUDED.roll_number,
                                register_number = EXCLUDED.register_number,
                                degree = EXCLUDED.degree,
                                marks_json = EXCLUDED.marks_json,
                                cgpa = EXCLUDED.cgpa,
                                issue_date = EXCLUDED.issue_date,
                                confidence_json = EXCLUDED.confidence_json,
                                source_hash = EXCLUDED.source_hash,
                                fields_hash = EXCLUDED.fields_hash,
                                document_type = EXCLUDED.document_type,
                                attributes_json = EXCLUDED.attributes_json
                            RETURNING public_verification_id
                            """,
                            (
                                job_id,
                                raw_fields.get("name"),
                                raw_fields.get("roll_number"),
                                raw_fields.get("register_number"),
                                raw_fields.get("degree"),
                                Jsonb(raw_fields.get("marks")) if raw_fields.get("marks") is not None else None,
                                (raw_fields.get("cgpa") if raw_fields.get("cgpa") else None),
                                (raw_fields.get("issue_date") if raw_fields.get("issue_date") else None),
                                Jsonb(confidence_json),
                                source_hash,
                                fields_hash,
                                uploader_is_issuer,  # change A
                                raw_fields.get("document_type") or "grade_sheet",
                                Jsonb(raw_fields.get("attributes_json") or {}),
                            ),
                        )

                        row = cur.fetchone()
                        public_verification_id = str(row[0]) if row else ""

                        # Test hook after record upsert
                        if self.after_record_upsert:
                            self.after_record_upsert(job_id)

                        # Update job status
                        cur.execute(
                            "UPDATE jobs SET status = %s WHERE id = %s",
                            (final_status, job_id),
                        )

            # Generate and upload QR-stamped PDF certificate copy to stamped-documents container
            if final_status == "processed" and public_verification_id:
                try:
                    with self.store.open(blob_key) as f:
                        raw_doc_bytes = f.read()
                    stamped_pdf_bytes = stamp_certificate(
                        raw_bytes=raw_doc_bytes,
                        job_id=str(job_id),
                        public_verification_id=public_verification_id,
                        fields_hash=fields_hash,
                        source_hash=source_hash,
                    )
                    stamped_key = f"stamped-documents/{job_id}/stamped_certificate.pdf"
                    self.store.put(stamped_key, stamped_pdf_bytes)
                    logger.info("Stored QR-stamped certificate copy at %s", stamped_key)
                except Exception as e:
                    logger.warning("Failed to stamp certificate for job %s: %s", job_id, e)

            # 6. Complete message
            self.queue.complete(message)

            # 7. Notify API (non-blocking failure)
            if final_status != "no_op":
                self._notify_api(job_id, final_status)

            return final_status

        except SimulatedCrash:
            logger.warning("Simulated worker crash for job %s; skipping abandon/complete", job_id)
            raise

        except FatalError as e:
            reason = str(e)
            logger.error("Fatal error processing job %s: %s", job_id, reason)
            try:
                with self.conn.cursor() as cur:
                    cur.execute(
                        "UPDATE jobs SET status = 'failed', failure_reason = %s WHERE id = %s",
                        (reason, job_id),
                    )
                if not self.conn.autocommit:
                    self.conn.commit()
            except Exception as db_err:
                logger.error("Failed to mark job %s as failed: %s", job_id, db_err)

            self.queue.complete(message)
            return "failed"

        except Exception as e:
            logger.exception("Transient failure processing job %s: %s; abandoning message", job_id, e)
            self.queue.abandon(message)
            return "abandoned"

    def _notify_api(self, job_id: uuid.UUID, status: str) -> None:
        """Call internal notify endpoint with X-Internal-Secret."""
        if not self.internal_api_key or not self.api_internal_url:
            return

        url = f"{self.api_internal_url}/internal/v1/jobs/{job_id}/notify"
        payload = json.dumps({"job_id": str(job_id), "status": status}).encode("utf-8")

        req = urllib.request.Request(
            url,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "X-Internal-Secret": self.internal_api_key,
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                if resp.status != 204:
                    logger.warning("API notify returned unexpected status code: %s", resp.status)
        except Exception as e:
            # Swallow notify failure; it must not fail the job
            logger.warning("Failed to notify API for job %s: %s (swallowed)", job_id, e)
