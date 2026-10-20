// Read-only source inventory; never imports page code or calls application APIs.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import { NAVIGATION } from '../src/config/navigation.js';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(resolve(repo, path), 'utf8');
const ast = parse(read('frontend/src/App.jsx'), { sourceType: 'module', plugins: ['jsx'] });
const attr = (node, name) => node.openingElement.attributes.find(a => a.type === 'JSXAttribute' && a.name.name === name)?.value;
const tag = node => node?.openingElement?.name?.name;
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (node.type) visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(item => walk(item, visit));
    else if (value && typeof value === 'object') walk(value, visit);
  }
}
const routes = [];
const reviewPath = resolve(repo, 'docs/application-ui-migration/reviews.json');
const reviews = existsSync(reviewPath) ? JSON.parse(readFileSync(reviewPath, 'utf8')) : {};
const guards = ['ProtectedRoute', 'VerifiedContractorRoute', 'ProviderProfileRoute'];
function inventoryRoute(node, inherited = []) {
  const element = attr(node, 'element');
  const names = [];
  const redirects = [];
  walk(element, item => {
    if (item.type !== 'JSXElement') return;
    names.push(tag(item));
    if (tag(item) === 'Navigate') redirects.push(attr(item, 'to')?.value || 'computed');
  });
  const access = [...new Set([...inherited, ...names.filter(name => guards.includes(name))])];
  const path = attr(node, 'path')?.value;
  if (path) routes.push(describeRoute(path, names, redirects, access));
  for (const child of node.children || []) {
    if (child.type === 'JSXElement' && tag(child) === 'Route') inventoryRoute(child, access);
  }
}
function describeRoute(path, names, redirects, access) {
  const review = reviews[path];
  const page = names.find(name => existsSync(resolve(repo, `frontend/src/pages/${name}.jsx`)));
  const sourcePath = page ? `frontend/src/pages/${page}.jsx` : null;
  const source = sourcePath ? read(sourcePath) : '';
  const exact = NAVIGATION.filter(entry => [entry.route, ...(entry.aliases || [])].some(route => route.split('?')[0] === path));
  const parent = exact.length ? exact : NAVIGATION.filter(entry => path.startsWith(entry.route.split('?')[0] + '/'));
  const roles = [...new Set(parent.flatMap(entry => entry.roles))];
  return {
    path, page: page || names.find(Boolean) || 'redirect', source: sourcePath,
    guards: access, navigationRoles: roles,
    roleNote: 'Navigation roles are discovery hints, not authorization proof; inspect page guards and backend permissions.',
    kind: path.startsWith('/preview/') ? 'development-only' : redirects.length || path === '*' ? 'redirect' : access.includes('ProtectedRoute') ? 'authenticated' : 'public',
    redirects,
    sharedComponents: [...new Set([
      ...[...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']*components[^"']*)["']/g)].flatMap(match => match[1].split(',').map(v => v.trim())),
      ...[...source.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from\s*["']([^"']*components[^"']*)["']/g)].map(match => match[1]),
    ])],
    styles: [...source.matchAll(/import\s*["']([^"']+\.css)["']/g)].map(match => match[1]),
    apiReads: [...new Set([...source.matchAll(/api\.get\(\s*["'`]([^"'`]+)["'`]/g)].map(match => match[1]))],
    apiWrites: [...new Set([...source.matchAll(/api\.(post|patch|put|delete)\(\s*["'`]([^"'`]+)["'`]/g)].map(match => `${match[1].toUpperCase()} ${match[2]}`))],
    patterns: {
      forms: /<form\b/.test(source), tables: /<table\b/.test(source),
      dialogs: /<dialog\b|Dialog|Modal|fixed inset-0/.test(source),
      filters: /search|filter/i.test(source), translationHook: /useLanguage|ScriptText/.test(source),
    },
    status: review?.status || (path.startsWith('/preview/') ? 'excluded: development preview' : redirects.length || path === '*' ? 'redirect: verify destination' : 'pending: shared theme present; full page review required'),
    checklist: { structure: false, controls: false, states: false, permissions: false, translations: false, mobile: false, desktop: false, visualReview: false, ...(review?.checklist || {}) },
    evidence: review?.evidence || [], remaining: review?.remaining || [],
  };
}
// Top-level routes only; nested routes are handled with inherited guards.
function findRoutes(node, inRoute = false) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'JSXElement' && tag(node) === 'Route') {
    if (!inRoute) inventoryRoute(node);
    return;
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(item => findRoutes(item, inRoute));
    else if (value && typeof value === 'object') findRoutes(value, inRoute);
  }
}
findRoutes(ast);
const output = resolve(repo, 'docs/application-ui-migration');
mkdirSync(output, { recursive: true });
writeFileSync(resolve(output, 'routes.json'), JSON.stringify({ generatedFrom: 'frontend/src/App.jsx', routes }, null, 2) + '\n');
const lines = ['# Application route inventory', '', 'Source-derived inventory. A shared colour change is not completion. Navigation roles below are hints, not proof of route/API authorization.', '', '| Route | Component | Layout/guards | Menu roles | Migration status |', '| --- | --- | --- | --- | --- |'];
for (const route of routes) lines.push(`| \`${route.path}\` | ${route.page} | ${route.guards.join(', ') || 'Public'} | ${route.navigationRoles.join(', ') || 'Inspect page'} | ${route.status} |`);
writeFileSync(resolve(output, 'routes.md'), lines.join('\n') + '\n');
console.log(`${routes.length} routes inventoried; ${routes.filter(route => route.source).length} page routes. No application data accessed.`);
