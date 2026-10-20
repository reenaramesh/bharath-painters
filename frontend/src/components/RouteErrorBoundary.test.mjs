import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { transformWithOxc } from 'vite';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const url = new URL('./RouteErrorBoundary.jsx', import.meta.url);
const transformed = await transformWithOxc(await readFile(url, 'utf8'), url.pathname, { jsx: { runtime: 'automatic' } });
const stub = `data:text/javascript;base64,${Buffer.from('import React from '+JSON.stringify(import.meta.resolve('react'))+'; export const Link=({children,...props})=>React.createElement("a",props,children);').toString('base64')}`;
const code = transformed.code.replace(/from\s+(["'])([^"']+)\1/g, (_m, _q, path) => `from ${JSON.stringify(path === 'react-router-dom' ? stub : import.meta.resolve(path))}`);
const Boundary = (await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)).default;

test('healthy navigation preserves child state; route change recovers a captured failure', async () => {
  let mounts = 0;
  function Page({fail=false}) {
    React.useEffect(()=>{mounts++;},[]);
    if(fail) throw new Error('test page failure');
    return React.createElement('span',null,'Page ready');
  }
  const render=(route,fail=false)=>React.createElement(Boundary,{resetKey:route},React.createElement(Page,{fail}));
  let view;
  await act(async()=>{view=create(render('/one'));});
  await act(async()=>view.update(render('/two')));
  assert.equal(mounts,1);
  const log=console.error;
  try {
    console.error=()=>{};
    await act(async()=>view.update(render('/two',true)));
    assert.match(JSON.stringify(view.toJSON()),/could not be displayed/);
    await act(async()=>view.update(render('/three')));
    assert.match(JSON.stringify(view.toJSON()),/Page ready/);
    assert.equal(mounts,2);
  } finally { console.error=log; await act(async()=>view.unmount()); }
});
