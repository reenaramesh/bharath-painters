"""Isolated backend gate with explicit exit status and clean UTF-8 logs."""
import contextlib
import faulthandler
import os
from pathlib import Path
import sys
import json
import re
import tempfile

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
os.environ['DJANGO_SETTINGS_MODULE']='config.settings'
os.environ['DATABASE_URL']='sqlite:///:memory:'
import django
django.setup()
from django.conf import settings
from django.core.management import call_command

mode=sys.argv[1] if len(sys.argv)>1 else 'auth'
if mode not in ['auth','full','failed']:raise SystemExit('Use auth, full or failed')
tests=['accounts.tests.AuthenticationApiTests'] if mode=='auth' else ['accounts','quotations','jobs','outsourcing','billing']
if mode=='failed':
    failures=json.loads((Path(__file__).resolve().parents[2]/'docs/previews/pre-push-backend-failures.json').read_text())
    tests=[f'{match[2]}.{match[1]}' for row in failures if (match:=re.match(r'(\w+) \(([^)]+)\)',row['test']))]
if mode!='auth':settings.PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher']
log=Path(__file__).resolve().parents[2]/'docs/previews'/f'pre-push-backend-{mode}-verified.log'
code=0
with tempfile.TemporaryDirectory(prefix='bharath-backend-gate-') as media,log.open('w',encoding='utf-8') as out:
    settings.MEDIA_ROOT=media
    with contextlib.redirect_stdout(out),contextlib.redirect_stderr(out):
        faulthandler.dump_traceback_later(120,repeat=True,file=out)
        try:call_command('test',*tests,interactive=False,verbosity=1)
        except SystemExit as error:code=int(error.code or 0)
        finally:faulthandler.cancel_dump_traceback_later()
print(f'{mode} backend gate exit {code}; log: {log}')
raise SystemExit(code)
