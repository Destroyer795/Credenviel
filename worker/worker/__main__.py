"""Worker CLI entry point."""

import argparse
import logging
import signal
import sys
import time

import psycopg

from credenviel_shared.local_queue import LocalQueue
from credenviel_shared.store import LocalFileStore
from worker.config import load_config
from worker.extractor import StubExtractor
from worker.processor import WorkerProcessor

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("worker")


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
    if not args.stub_extractor:
        logger.error("--stub-extractor flag is required in Phase 1")
        sys.exit(2)

    logger.info("Running with STUB extractor (load-test mode)")
    logger.info("Stub extractor profile: %s", args.stub_profile)

    config = load_config()

    # Signal handling for clean exit on Ctrl-C
    running = True

    def handle_signal(sig, frame):
        nonlocal running
        logger.info("Shutdown signal received; finishing current task...")
        running = False

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    store = LocalFileStore(config["local_storage_root"])
    extractor = StubExtractor(profile=args.stub_profile)

    with psycopg.connect(config["database_url"], autocommit=True) as conn:
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

        while running:
            msg = queue.receive()
            if msg is None:
                if args.once:
                    logger.info("Queue empty and --once flag set; exiting.")
                    break
                time.sleep(args.poll_interval)
                continue

            try:
                outcome = processor.process_message(msg)
                logger.info("Processed message %s: outcome=%s", msg.id, outcome)
            except Exception as e:
                logger.exception("Error processing message %s: %s", msg.id, e)

        logger.info("Worker stopped.")


if __name__ == "__main__":
    main()
