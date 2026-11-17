import json
from pathlib import Path

ROUTES = {row['screen']: row['module'] for row in json.loads(Path(__file__).with_name('taxonomy.json').read_text())}
MODULES = sorted(set(ROUTES.values()))
ROLES = ['CONTRACTOR', 'PAINTER', 'CUSTOMER', 'EMPLOYEE']
ACTIONS = json.loads(Path(__file__).with_name('actions.json').read_text())
ACTION_MAP = {row['id']: row for row in ACTIONS}
