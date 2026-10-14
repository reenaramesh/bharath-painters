"""Apply only the additive Work Order migration to workspace SQLite, with backup."""
import hashlib
import json
import os
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings')
import django
django.setup()
from django.conf import settings
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.core.management import call_command

db=settings.DATABASES['default']
path=Path(db['NAME']).resolve()
if db['ENGINE']!='django.db.backends.sqlite3' or not path.is_file() or path != (ROOT/'backend/db.sqlite3').resolve():
 raise SystemExit('Refusing schema changes outside workspace-local backend/db.sqlite3.')
target=('outsourcing','0002_subcontractquote_pricing_and_more')
plan=MigrationExecutor(connection).migration_plan([target])
if any((migration.app_label,migration.name)!=target or backwards for migration,backwards in plan):
 raise SystemExit('Refusing to apply unrelated or reverse migrations.')

def snapshot():
 with sqlite3.connect(path) as db:
  tables=[row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'quotations_%' ORDER BY name")]
  return {table:hashlib.sha256(json.dumps(db.execute(f'SELECT * FROM "{table}" ORDER BY rowid').fetchall(),default=str,separators=(',',':')).encode()).hexdigest() for table in tables}

before=snapshot()
backup=None
if plan:
 folder=ROOT/'backend/.qa-temp';folder.mkdir(exist_ok=True)
 backup=folder/f'pre-work-order-pricing-{datetime.now():%Y%m%d-%H%M%S}.sqlite3'
 with sqlite3.connect(path) as source, sqlite3.connect(backup) as copy:source.backup(copy)
 call_command('migrate','outsourcing',target[1],interactive=False,verbosity=1)
after=snapshot()
result={'database':'backend/db.sqlite3','migration':target[1],'applied':bool(plan),'backup':str(backup) if backup else None,'quotation_tables_checked':len(before),'quotation_content_unchanged':before==after}
artifacts=ROOT/'docs/previews/work-order-pricing'
artifacts.mkdir(parents=True,exist_ok=True)
(artifacts/'local-migration.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result,indent=2))
if before!=after:raise SystemExit('Quotation table content changed; inspect the retained backup before further work.')
