"""Worker configuration — loaded from environment variables."""

import os


def load_config() -> dict:
    """Load configuration from environment variables with sensible defaults."""
    host = os.getenv("PGHOST", "localhost")
    port = os.getenv("PGPORT", "5433")
    user = os.getenv("PGUSER", "credenviel")
    password = os.getenv("PGPASSWORD", "localdev")
    dbname = os.getenv("PGDATABASE", "credenviel")

    default_db = f"postgresql://{user}:{password}@{host}:{port}/{dbname}"

    return {
        "port": os.getenv("PORT", "8081"),
        "database_url": os.getenv("DATABASE_URL", default_db),
        "queue_connection_string": os.getenv("QUEUE_CONNECTION_STRING", ""),
        "queue_name": os.getenv("QUEUE_NAME", "job-processing"),
        "blob_connection_string": os.getenv("BLOB_CONNECTION_STRING", ""),
        "blob_container": os.getenv("BLOB_CONTAINER", "raw-uploads"),
        "doc_intelligence_endpoint": os.getenv("DOC_INTELLIGENCE_ENDPOINT", ""),
        "doc_intelligence_key": os.getenv("DOC_INTELLIGENCE_KEY", ""),
        "doc_intelligence_model_id": os.getenv("DOC_INTELLIGENCE_MODEL_ID", ""),
        "confidence_threshold": float(os.getenv("CONFIDENCE_THRESHOLD", "0.85")),
        "api_internal_url": os.getenv("API_INTERNAL_URL", "http://localhost:8080"),
        "internal_api_key": os.getenv("INTERNAL_API_KEY", ""),
        "local_storage_root": os.getenv("LOCAL_STORAGE_ROOT", ".local-storage"),
    }
