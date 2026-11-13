# ---- build stage: install Python dependencies --------------------------------
FROM python:3.12-slim AS builder
WORKDIR /build
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ---- runtime stage ---------------------------------------------------------------
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

# XGBoost needs the OpenMP runtime, which the slim image does not include.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libgomp1 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /install /usr/local
COPY alembic.ini docker-entrypoint.sh ./
COPY migrations ./migrations
COPY app ./app
COPY models ./models

# Run as an unprivileged user.
RUN useradd --create-home --uid 10001 appuser \
 && chmod +x docker-entrypoint.sh \
 && chown -R appuser /app
USER appuser

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD python -c "import os,sys,urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:%s/api/v1/health/ready' % os.environ.get('PORT','8000'), timeout=4).status == 200 else 1)"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
