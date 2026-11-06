# Linux container for cross-platform reproduction.
#
# The native Windows demo remains the primary evidence environment. This image
# exists so the lab can be rebuilt on Linux, macOS or CI without relying on
# Windows case-insensitive path resolution (see docs/DOCKER.md and the V3 alias
# in fileagent/engine.py).
FROM python:3.12.1-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    HOME=/tmp \
    TMPDIR=/tmp

WORKDIR /app

# ca-certificates is required for the optional DeepSeek HTTPS endpoint.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=10001:10001 fileagent ./fileagent
COPY --chown=10001:10001 web ./web
COPY --chown=10001:10001 tests ./tests
COPY --chown=10001:10001 scripts ./scripts
COPY --chown=10001:10001 server.py README.md ./

RUN mkdir -p /app/runtime && chown -R 10001:10001 /app

USER 10001:10001

VOLUME ["/app/runtime"]
EXPOSE 8765

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8765/api/config', timeout=3)"

CMD ["python", "server.py", "--port", "8765"]
