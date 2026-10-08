"""Worker CLI entry point."""

import argparse
import logging
import signal
import sys
import time

import psycopg

from credenviel_shared.blob_store import BlobStore
from credenviel_shared.local_queue import LocalQueue
from credenviel_shared.service_bus_queue import ServiceBusQueue
from credenviel_shared.store import LocalFileStore
from worker.config import load_config
from worker.extractor import StubExtractor, get_extractor
from worker.processor import WorkerProcessor

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("worker")


from typing import Any, Callable

def run_worker_loop(
    processor: WorkerProcessor,
    queue: Any,
    poll_interval: float = 1.0,
    once: bool = False,
    is_running_fn: Callable[[], bool] | None = None,
) -> int:
    """Run worker processing loop until stopped or queue drained with once flag.

    Returns the number of messages processed.
    """
    processed_count = 0
    while is_running_fn() if is_running_fn else True:
        try:
            msg = queue.receive()
        except Exception as e:
            logger.warning("Error receiving message from queue: %s", e)
            if not (is_running_fn() if is_running_fn else True):
                break
            time.sleep(poll_interval)
            continue

        if msg is None:
            if once:
                logger.info("Queue empty and --once flag set; exiting.")
                break
            time.sleep(poll_interval)
            continue

        try:
            outcome = processor.process_message(msg)
            processed_count += 1
            msg_id = getattr(msg, "id", None)
            logger.info("Processed message %s: outcome=%s", msg_id, outcome)
        except Exception as e:
            logger.exception("Error processing message: %s", e)
            if hasattr(processor, "conn") and getattr(processor.conn, "closed", False):
                logger.critical("Database connection was closed; terminating worker loop to trigger container restart")
                raise

    return processed_count


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Certificate Digitization Worker"
    )
    parser.add_argument(
        "--stub-extractor",
        action="store_true",
        help="Use stub extractor (required in Phase 1)",
    )
    parser.add_argument(
        "--stub-profile",
        choices=["high", "low"],
        default="high",
        help="Confidence profile for stub extractor (high or low)",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Drain available messages and exit cleanly",
    )
    parser.add_argument(
        "--poll-interval",
        type=float,
        default=1.0,
        help="Seconds to wait between polls when queue is empty",
    )
    args = parser.parse_args()

    # Spec § 5.7: --stub-extractor is required; exit code 2 without it
    config = load_config()

    # Require --stub-extractor unless DOC_INTELLIGENCE_ENDPOINT is configured
    if not args.stub_extractor and not config.get("doc_intelligence_endpoint"):
        logger.error("--stub-extractor flag is required when DOC_INTELLIGENCE_ENDPOINT is not configured")
        sys.exit(2)

    use_stub = args.stub_extractor or not bool(config.get("doc_intelligence_endpoint"))
    extractor = get_extractor(config, use_stub=use_stub, stub_profile=args.stub_profile)

    if use_stub:
        logger.info("Running with STUB extractor (load-test mode)")
        logger.info("Stub extractor profile: %s", args.stub_profile)
    else:
        logger.info("Running with Azure Document Intelligence extractor")

    # Signal handling for clean exit on SIGTERM/SIGINT
    running = True

    def handle_signal(sig, frame):
        nonlocal running
        sig_name = "SIGTERM" if sig == signal.SIGTERM else "SIGINT"
        logger.info("Shutdown signal %s received; finishing current task...", sig_name)
        running = False

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    if config["store_backend"] == "blob":
        store = BlobStore(
            storage_account_name=config["storage_account_name"],
            managed_identity_client_id=config["azure_client_id"] or None,
        )
    else:
        store = LocalFileStore(config["local_storage_root"])

    with psycopg.connect(config["database_url"], autocommit=True) as conn:
        if config["queue_backend"] == "servicebus":
            queue = ServiceBusQueue(
                fully_qualified_namespace=config["servicebus_fqdn"],
                queue_name=config["servicebus_queue"],
                managed_identity_client_id=config["azure_client_id"] or None,
            )
        else:
            queue = LocalQueue(conn)
        processor = WorkerProcessor(
            conn=conn,
            queue=queue,
            store=store,
            extractor=extractor,
            confidence_threshold=config["confidence_threshold"],
            api_internal_url=config["api_internal_url"],
            internal_api_key=config["internal_api_key"],
        )

        logger.info("Worker started, polling queue 'job-processing'...")

        run_worker_loop(
            processor=processor,
            queue=queue,
            poll_interval=args.poll_interval,
            once=args.once,
            is_running_fn=lambda: running,
        )

        logger.info("Worker stopped cleanly.")
        sys.exit(0)


if __name__ == "__main__":
    main()
