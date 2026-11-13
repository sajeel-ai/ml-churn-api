#!/bin/sh
# Optionally apply database migrations before starting the API.
# Migrations are additive and idempotent; set RUN_MIGRATIONS=false to run them manually instead.
set -e
if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  echo "Applying database migrations..."
  alembic upgrade head
fi
exec "$@"
