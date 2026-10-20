import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

function routeEffects(tab: string | undefined) {
  const effects: (() => unknown)[] = [];
  const changes: unknown[] = [];
  let stateIndex = 0;
  const hooks = {
    useCallback: (fn: unknown) => fn,
    useEffect: (fn: () => unknown) => effects.push(fn),
    useState: (initial: unknown) => { const index = stateIndex++; return [typeof initial === 'function' ? initial() : initial, (value: unknown) => { if (value === 'ATTENDANCE' || value === 'EARNINGS') changes.push(value); }]; },
  };
  const source = readFileSync(new URL('../src/screens/PainterWorkspaceScreen.tsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} as { PainterWorkspaceScreen: () => unknown } };
  const require = (name: string) => {
    if (name === 'react') return hooks;
    if (name === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null };
    if (name === 'expo-router') return { useLocalSearchParams: () => ({ tab }) };
    if (name.includes('AppProvider')) return { useApp: () => ({ user: null }), api: {} };
    if (name === 'react-native-paper') return { useTheme: () => ({ colors: {} }) };
    if (name.endsWith('/theme')) return { tokens: { space: {} } };
    if (name.endsWith('/components/ui')) return { styles: {} };
    return {};
  };
  vm.runInNewContext(compiled, { exports: module.exports, module, require, Date });
  module.exports.PainterWorkspaceScreen();
  effects.forEach(effect => effect());
  return changes;
}

test('painter attendance deep link changes tab exactly once and earnings deep link remains supported', () => {
  assert.deepEqual(routeEffects('ATTENDANCE'), ['ATTENDANCE']);
  assert.deepEqual(routeEffects('EARNINGS'), ['EARNINGS']);
  assert.deepEqual(routeEffects(undefined), []);
});

