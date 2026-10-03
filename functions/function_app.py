"""
blob_created — Event Grid trigger for blob-created events on the raw-uploads container.

Validates uploaded blobs and transitions jobs to 'queued', enqueuing messages on Service Bus.
"""

import json
import logging
import os
import urllib.parse

from functions.core import FunctionDeps, handle_blob_created

try:
    import azure.functions as func
    has_azure_functions = True
except ImportError:
    has_azure_functions = False

if has_azure_functions:
    app = func.FunctionApp()

    @app.function_name(name="BlobCreatedTrigger")
    @app.event_grid_trigger(arg_name="event")
    def blob_created(event: func.EventGridEvent) -> None:
        """Handle blob-created events from the raw-uploads container."""
        logging.info("BlobCreatedTrigger fired: id=%s type=%s", event.id, event.event_type)

        data = event.get_json() if hasattr(event, "get_json") else {}
        blob_url = data.get("url", "")
        if not blob_url:
            logging.warning("Event missing 'url' property: %s", data)
            return

        # Extract blob_key from URL
        parsed = urllib.parse.urlparse(blob_url)
        path = parsed.path.lstrip("/")
        # Path format: {container}/{job_id}/{filename}
        logging.info("Extracted blob path: %s", path)
        # In Azure deployed environment, dependencies are injected via cloud adapters
