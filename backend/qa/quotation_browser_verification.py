"""Compatibility entry point for the unified quotation browser regression."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from qa.quotation_unified_verification import BrowserAudit
if __name__=='__main__':
 import django
 from django.conf import settings
 from django.test.runner import DiscoverRunner
 settings.MIGRATION_MODULES={app.label:None for app in django.apps.apps.get_app_configs()}
 raise SystemExit(DiscoverRunner(verbosity=1,interactive=False).run_tests(['qa.quotation_unified_verification.BrowserAudit']))
