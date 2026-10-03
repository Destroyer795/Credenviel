# Azure Function — Blob-Created Trigger

Certificate Digitization & Verification Pipeline — Azure Function that validates uploaded blobs and enqueues jobs to Service Bus.

Triggered by Event Grid when a blob is created in the `raw-uploads` container.

## Local development

```bash
pip install -r requirements.txt
# Requires Azure Functions Core Tools: func start
```
