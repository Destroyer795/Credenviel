# Python Worker

Certificate Digitization & Verification Pipeline — Python worker service.

Runs on Azure Container Apps with KEDA-based scaling on Service Bus queue depth. Consumes job messages, extracts fields via Document Intelligence, computes hashes, and writes records.

## Setup

```bash
pip install -r requirements.txt
```

## Run

```bash
python -m worker --stub-extractor  # Use stub extractor for load testing
python -m worker                    # Use real Document Intelligence
```
