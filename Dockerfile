FROM node:22.23.1-alpine3.24 AS frontend-build
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12.13-slim-bookworm AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    APP_DATA_DIR=/app/data \
    PORT=8000
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir --disable-pip-version-check -r requirements.txt \
    && groupadd --gid 10001 report \
    && useradd --uid 10001 --gid report --no-create-home --shell /usr/sbin/nologin report
COPY --chown=report:report server.py app_security.py facebook_connection.py portfolio.py report_elements.py ./
COPY --chown=report:report api_client.py analyzer.py scoring.py serializer.py sample_data.py topic_extractor.py ./
COPY --chown=report:report import_pipeline ./import_pipeline
COPY --chown=report:report --from=frontend-build /build/frontend/dist /app/frontend/dist
RUN mkdir -p /app/data && chown report:report /app/data
USER report
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3)" || exit 1
CMD ["python", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000", "--no-server-header"]
