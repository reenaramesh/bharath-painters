import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const modulePath = fileURLToPath(new URL('./appTheme.js', import.meta.url));

test('normalizes the former default workspace colors and preserves explicit custom colors', async () => {
  assert.ok(existsSync(modulePath), 'the shared app theme resolver should exist');
  const { resolveAppTheme } = await import('./appTheme.js');
  assert.deepEqual(resolveAppTheme({ app_primary_color: '#176B9B', app_accent_color: '#508398' }), {
    app_primary_color: '#2563EB', app_accent_color: '#F59E0B',
  });
  assert.deepEqual(resolveAppTheme({ app_primary_color: '#276749', app_accent_color: '#8BBF9F' }), {
    app_primary_color: '#276749', app_accent_color: '#8BBF9F',
  });
});
