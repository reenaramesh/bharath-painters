import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { systemCopy } from './vite-plugin.mjs';

const require = createRequire(new URL('../../frontend/package.json', import.meta.url));
const React = require('react');
assert.equal(React.version, require('react-dom/package.json').version, 'React and React DOM must use the same version to render the app.');
assert.equal(React.version, require('react-test-renderer/package.json').version);
const { renderToString } = require('react-dom/server');
const { build } = await import(pathToFileURL(require.resolve('vite')));
const root = fileURLToPath(new URL('../../frontend', import.meta.url));
await build({ root, configFile: false, plugins: [systemCopy()], logLevel: 'error', build: {
  ssr: 'src/__tests__/dashboard-render-fixture.jsx', outDir: '.test-build/dashboard',
  rollupOptions: { output: { entryFileNames: 'fixture.mjs' } },
} });
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.window = { location: { origin: 'http://localhost:5173' }, matchMedia: () => ({ matches: false }) };
const { DashboardFixture } = await import(pathToFileURL(root + '/.test-build/dashboard/fixture.mjs'));
for (const role of ['CONTRACTOR', 'PAINTER', 'ADMIN', 'SUPPORT', 'CUSTOMER']) {
  for (const preferred_language of ['en', 'te', 'kn', 'hi', 'ta']) {
    const html = renderToString(React.createElement(DashboardFixture, { user: {
      id: 1, role, preferred_language, company_name: 'Customer Save 123', is_verified: true,
    } }));
    assert.ok(html.includes('<main'), `${role}/${preferred_language} must render the dashboard shell.`);
    assert.ok(html.length > 1000, `${role}/${preferred_language} must render visible dashboard content.`);
  }
}
console.log('PASS: matching React versions and dashboard initial rendering for all five roles and scripts.');
