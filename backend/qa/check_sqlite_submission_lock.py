"""Reproduce submission's read-then-write transaction with a competing writer."""
import os
import sqlite3
import tempfile
import threading
import time
from pathlib import Path
import sys
from contextlib import closing

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
import django
django.setup()
from django.conf import settings
from django.db.backends.sqlite3.base import DatabaseWrapper

with tempfile.TemporaryDirectory() as directory:
    filename = str(Path(directory) / "contention.sqlite3")
    with closing(sqlite3.connect(filename)) as setup, setup:
        setup.execute("CREATE TABLE submission (status TEXT)")
        setup.execute("INSERT INTO submission VALUES ('DRAFT')")
    acquired = threading.Event()
    def competing_writer():
        with closing(sqlite3.connect(filename)) as writer, writer:
            writer.execute("BEGIN IMMEDIATE")
            writer.execute("UPDATE submission SET status = 'DRAFT'")
            acquired.set()
            time.sleep(0.3)
    config = {**settings.DATABASES['default'], 'NAME': filename}
    database = DatabaseWrapper(config, alias='contention')
    worker = threading.Thread(target=competing_writer)
    worker.start()
    assert acquired.wait(5), 'Competing writer did not start'
    try:
        database.ensure_connection()
        database.set_autocommit(False, force_begin_transaction_with_broken_autocommit=True)
        with database.cursor() as cursor:
            cursor.execute("SELECT status FROM submission")
            assert cursor.fetchone()[0] == 'DRAFT'
            cursor.execute("UPDATE submission SET status = 'SENT'")
        database.commit()
    finally:
        database.close()
        worker.join()
    with closing(sqlite3.connect(filename)) as verify:
        assert verify.execute("SELECT status FROM submission").fetchone()[0] == 'SENT'
print('PASS: submission transaction waits for a competing SQLite writer')
