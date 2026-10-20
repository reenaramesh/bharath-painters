import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { ApiError } from '../src/core/api.ts';

type Node = { type: unknown; props: Record<string, any> };
function measurementsHarness(roomOnline: boolean) {
  const slots: any[] = [];
  const effects: (() => unknown)[] = [];
  let index = 0;
  const queued: any[] = [], requests: any[] = [], cached: any[] = [];
  const hooks = {
    useState(initial: any) { const slot = index++; if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial; return [slots[slot], (value: any) => { slots[slot] = typeof value === 'function' ? value(slots[slot]) : value; }]; },
    useRef(initial: any) { const slot = index++; slots[slot] ||= { current: initial }; return slots[slot]; },
    useEffect(fn: () => unknown, deps: unknown[]) { const slot = index++; const previous = slots[slot]; if (!previous || deps.some((value, i) => value !== previous[i])) effects.push(fn); slots[slot] = deps; },
    useCallback: (fn: unknown) => fn,
    useMemo: (fn: () => unknown) => fn(),
  };
  const api = {
    async get(path: string) {
      if (path === '/quotations/properties/') return [{ id: 20, name: 'Home' }];
      if (path.endsWith('measurement-records/')) return [{ id: 90, reference_no: 'M90', version: 7, edit_revision: 4, surface_count: 0 }];
      if (path.includes('/rooms/')) return [{ id: 71, name: 'Bedroom', painting_area: 'INTERIOR', measurement_record: 90 }];
      return [];
    },
    async request(endpoint: string, payload: unknown) {
      requests.push({ endpoint, payload });
      if (roomOnline && endpoint.includes('/rooms/')) return { id: 72, name: 'Study', property: 20, measurement_record: 90, measurement_revision: 5 };
      throw new ApiError(0, 'Offline');
    },
  };
  const queue = {
    async listMobileOperations() { return queued; },
    async listCachedMeasurementContexts() { return []; },
    async getCachedMeasurementContext() { return null; },
    async cacheMeasurementContext(_actor: number, _property: number, context: unknown) { cached.push(context); },
    async enqueueMobileOperation(input: any) { const result = { ...input, id: `queued-${queued.length}`, state: 'PENDING' }; queued.push(result); return result; },
  };
  const source = readFileSync(new URL('../src/screens/MeasurementsScreen.tsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} as { MeasurementsScreen: () => Node } };
  const require = (name: string) => {
    if (name === 'react') return hooks;
    if (name === 'react/jsx-runtime') return { jsx: (type: unknown, props: Node['props']) => ({ type, props }), jsxs: (type: unknown, props: Node['props']) => ({ type, props }) };
    if (name === 'expo-router') return { useLocalSearchParams: () => ({}) };
    if (name.includes('AppProvider')) return { useApp: () => ({ user: { id: 1 }, demo: false }), api };
    if (name.endsWith('/api')) return { ApiError };
    if (name.endsWith('/offlineQueue')) return queue;
    if (name.endsWith('/phase4Capabilities')) return { offlineMeasurementSyncEnabled: true };
    if (name === 'react-native-paper') return { Button: 'Button', Card: { Content: 'Card.Content' }, TextInput: 'TextInput', useTheme: () => ({ colors: {} }) };
    if (name.endsWith('/theme')) return { tokens: { space: {} } };
    if (name.endsWith('/components/ui')) return { styles: {} };
    return {};
  };
  vm.runInNewContext(compiled, { exports: module.exports, module, require, Date, Math, crypto: globalThis.crypto, ApiError });
  let root: Node;
  const render = () => { index = 0; root = module.exports.MeasurementsScreen(); effects.splice(0).forEach(effect => effect()); };
  const nodes = (value: any): Node[] => Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === 'object' && value.props ? [value, ...nodes(value.props.children)] : [];
  const find = (predicate: (node: Node) => boolean) => { const result = nodes(root).find(predicate); assert.ok(result, 'Expected screen control'); return result.props; };
  const settle = async () => { await new Promise(resolve => setImmediate(resolve)); render(); };
  return { queued, requests, cached, render, settle, find };
}

test('measurement screen captures edit_revision separately from saved version for offline room', async () => {
  const ui = measurementsHarness(false);
  ui.render(); await ui.settle();
  ui.find(node => node.props.accessibilityLabel === 'Select Home').onPress(); await ui.settle();
  ui.find(node => node.props.label === 'New room name').onChangeText('Study'); ui.render();
  ui.find(node => node.props.children === 'Add room').onPress(); await ui.settle();
  assert.equal(ui.queued[0]?.expectedRevision, 4);
  assert.equal(ui.queued[0]?.expectedVersion, '7');
  assert.equal(ui.requests[0]?.payload.expected_revision, 4);
});

test('successful room acknowledgement supplies the next surface revision and cached draft revision', async () => {
  const ui = measurementsHarness(true);
  ui.render(); await ui.settle();
  ui.find(node => node.props.accessibilityLabel === 'Select Home').onPress(); await ui.settle();
  ui.find(node => node.props.label === 'New room name').onChangeText('Study'); ui.render();
  ui.find(node => node.props.children === 'Add room').onPress(); await ui.settle();
  ui.find(node => node.props.label === 'Length (ft)').onChangeText('10');
  ui.find(node => node.props.label === 'Height / width (ft)').onChangeText('8'); ui.render();
  ui.find(node => node.props.children === 'Save surface').onPress(); await ui.settle();
  assert.equal(ui.queued[0]?.expectedRevision, 5);
  assert.equal(ui.requests[1]?.payload.expected_revision, 5);
  assert.equal(ui.cached.at(-1)?.editRevision, 5);
});

test('new offline room surfaces capture an explicit sibling acknowledgement chain', async () => {
  const ui = measurementsHarness(false);
  ui.render(); await ui.settle();
  ui.find(node => node.props.accessibilityLabel === 'Select Home').onPress(); await ui.settle();
  ui.find(node => node.props.children === 'New draft').onPress(); ui.render();
  ui.find(node => node.props.label === 'New room name').onChangeText('Study'); ui.render();
  ui.find(node => node.props.children === 'Add room').onPress(); await ui.settle();
  for (const length of ['10', '12']) {
    ui.find(node => node.props.label === 'Length (ft)').onChangeText(length);
    ui.find(node => node.props.label === 'Height / width (ft)').onChangeText('8'); ui.render();
    ui.find(node => node.props.children === 'Save surface').onPress(); await ui.settle();
  }
  assert.equal(ui.queued.length, 3);
  assert.equal(ui.queued[0].expectedRevision, null);
  assert.equal(ui.queued[1].expectedRevision, null);
  assert.equal(ui.queued[1].dependsOn, ui.queued[0].id);
  assert.equal(ui.queued[1].revisionDependsOn, ui.queued[0].id);
  assert.equal(ui.queued[2].dependsOn, ui.queued[0].id);
  assert.equal(ui.queued[2].revisionDependsOn, ui.queued[1].id);
});

test('a later room gets a new identity after the previous queued room syncs', async () => {
  const ui = measurementsHarness(false);
  ui.render(); await ui.settle();
  ui.find(node => node.props.accessibilityLabel === 'Select Home').onPress(); await ui.settle();
  ui.find(node => node.props.label === 'New room name').onChangeText('Study'); ui.render();
  ui.find(node => node.props.children === 'Add room').onPress(); await ui.settle();
  const previousKey = ui.queued[0].clientMutationId;
  ui.queued[0].state = 'SYNCED';
  ui.find(node => node.props.accessibilityLabel === 'Select Home').onPress(); await ui.settle();
  ui.find(node => node.props.label === 'New room name').onChangeText('Kitchen'); ui.render();
  ui.find(node => node.props.children === 'Add room').onPress(); await ui.settle();
  assert.equal(ui.queued.length, 2);
  assert.notEqual(ui.queued[1].clientMutationId, previousKey);
});
