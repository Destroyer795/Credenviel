# syntax=docker/dockerfile:1
FROM python:3.11-slim

# Create unprivileged non-root user
RUN groupadd -r appuser && useradd -r -g appuser -d /app -s /sbin/nologin -c "Credenviel App User" appuser

WORKDIR /app

# Copy shared library and dependencies
COPY shared/python /tmp/shared-python
COPY worker/requirements.txt /tmp/worker-requirements.txt

# Install dependencies and shared package
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r /tmp/worker-requirements.txt && \
    pip install --no-cache-dir /tmp/shared-python && \
    rm -rf /tmp/shared-python /tmp/worker-requirements.txt

# Copy worker application code only (strictly excluding test files, scratch files, or test DBs)
COPY worker/worker /app/worker

# Run as non-root user
USER appuser

ENTRYPOINT ["python", "-m", "worker", "--stub-extractor"]
