"""Worker CLI entry point."""

import argparse
import logging
import os
import sys

from worker.config import load_config

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
        help="Use stub extractor (skips Document Intelligence call, returns fixed confidence) for load testing",
    )
    args = parser.parse_args()

    config = load_config()

    if args.stub_extractor:
        logger.info("Running with STUB extractor (load-test mode)")
    else:
        logger.info("Running with REAL Document Intelligence extractor")

    logger.info("Worker started (config loaded, port=%s)", config["port"])
    # TODO: Connect to Service Bus queue and start consuming messages
    logger.info("Worker exiting (no queue consumer implemented yet)")


if __name__ == "__main__":
    main()
