#!/usr/bin/env bash
set -euo pipefail
python manage.py check --deploy --fail-level ERROR
python manage.py migrate --check
python manage.py check_auth_infrastructure
# Exclude paths, query strings, headers and bodies from access logs: activation
# URLs contain tokens. Preserve method/status/duration for operations.
exec gunicorn config.wsgi:application --bind "0.0.0.0:${PORT:-10000}" \
  --access-logfile - --error-logfile - --access-logformat '%(h)s %(m)s %(s)s %(L)s'
