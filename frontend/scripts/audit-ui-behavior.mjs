// Compare current source with the pre-migration local snapshot, not Git HEAD.
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const baseline = resolve(repo, 'backend/.qa-temp/application-ui-20261016-start/frontend/src');
const current = resolve(repo, 'frontend/src');
const files = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(resolve(directory, entry.name)) : [resolve(directory, entry.name)]);
function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !['start', 'end', 'loc', 'extra', 'leadingComments', 'trailingComments', 'innerComments'].includes(key)).map(([key, child]) => [key, clean(child)]));
}
function apiCalls(source) {
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
  const calls = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression' && node.callee?.type === 'MemberExpression' && node.callee.object?.name === 'api' && ['get', 'post', 'patch', 'put', 'delete'].includes(node.callee.property?.name)) calls.push({ method: node.callee.property.name, args: clean(node.arguments) });
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(ast);
  return calls;
}
const report = { baseline: relative(repo, baseline), checkedPages: 0, checkedLogicFiles: 0, changedApiExpressions: [], changedLogicFiles: [], note: 'Source preservation evidence, not proof of backend authorization or live API integration.' };
for (const path of files(resolve(baseline, 'pages')).filter(path => /\.jsx$/.test(path))) {
  const name = relative(baseline, path), target = resolve(current, name);
  report.checkedPages++;
  if (!existsSync(target) || JSON.stringify(apiCalls(readFileSync(path, 'utf8'))) !== JSON.stringify(apiCalls(readFileSync(target, 'utf8')))) report.changedApiExpressions.push(name);
}
for (const folder of ['api', 'context', 'hooks', 'utils']) {
  for (const path of files(resolve(baseline, folder)).filter(path => /\.(?:[cm]?js|jsx)$/.test(path) && !/\.test\./.test(path))) {
    const name = relative(baseline, path), target = resolve(current, name);
    report.checkedLogicFiles++;
    if (!existsSync(target) || !readFileSync(path).equals(readFileSync(target))) report.changedLogicFiles.push(name);
  }
}
for (const name of ['components/ProtectedRoute.jsx', 'components/VerifiedContractorRoute.jsx', 'components/ProviderProfileRoute.jsx', 'config/navigation.js']) {
  report.checkedLogicFiles++;
  if (!readFileSync(resolve(baseline, name)).equals(readFileSync(resolve(current, name)))) report.changedLogicFiles.push(name);
}
writeFileSync(resolve(repo, 'docs/application-ui-migration/behavior-preservation.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (report.changedApiExpressions.length || report.changedLogicFiles.length) process.exitCode = 1;
