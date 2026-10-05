# credenviel-shared

Shared Python library for Credenviel services (`worker`, `functions`).
Contains abstract interfaces and local implementations for:
- Queue (peek-lock semantics via PostgreSQL `local_queue_messages`)
- Store (atomic local file storage with traversal prevention)
- Filetype (magic bytes validation)
- TestDB (safety-guarded test database fixtures)
