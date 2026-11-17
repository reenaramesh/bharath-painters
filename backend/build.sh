#!/usr/bin/env bash
set -euo pipefail
pip install -r requirements.txt
python manage.py collectstatic --noinput
# Review/backup and run migrations separately; builds must not modify live data.
