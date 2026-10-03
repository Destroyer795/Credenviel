"""
blob_created — Event Grid trigger for blob-created events on the raw-uploads container.

This function:
1. Validates the uploaded blob (file type and size)
2. Updates the job status from awaiting_upload to queued
3. Sends a message to Service Bus referencing the job ID

Currently a stub that only logs the event.
"""

import json
import logging
import azure.functions as func

app = func.FunctionApp()


@app.function_name(name="BlobCreatedTrigger")
@app.event_grid_trigger(arg_name="event")
def blob_created(event: func.EventGridEvent) -> None:
    """Handle blob-created events from the raw-uploads container."""
    logging.info("BlobCreatedTrigger fired")
    logging.info("  Event ID: %s", event.id)
    logging.info("  Event type: %s", event.event_type)
    logging.info("  Subject: %s", event.subject)
    logging.info("  Data: %s", json.dumps(event.get_json()))

    # TODO Phase 1: Validate file type and size
    # TODO Phase 1: Extract job_id from blob path
    # TODO Phase 1: Update job status to 'queued' in PostgreSQL
    # TODO Phase 1: Send {job_id} message to Service Bus queue

    logging.info("BlobCreatedTrigger completed (stub — no processing performed)")
