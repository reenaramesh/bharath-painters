import assert from 'node:assert/strict';
import test from 'node:test';
import * as composer from './chatComposer.mjs';

test('composer grows, caps to keyboard viewport, follows final line and resets after send', () => {
  assert.equal(typeof composer.resizeChatComposer, 'function');
  const input = { style: {}, scrollHeight: 92, clientHeight: 44, scrollTop: 0, value: 'first\nlast', selectionEnd: 10 };
  composer.resizeChatComposer(input, 800);
  assert.equal(input.style.height, '92px');
  input.scrollHeight = 600;
  composer.resizeChatComposer(input, 300);
  assert.equal(input.style.height, '90px');
  assert.equal(input.style.overflowY, 'auto');
  assert.equal(input.scrollTop, 600);
  input.value = '';
  composer.resizeChatComposer(input, 300);
  assert.equal(input.style.height, '44px');
});

test('composer does not force an earlier editing caret to the final line', () => {
  assert.equal(typeof composer.resizeChatComposer, 'function');
  const input = { style: {}, scrollHeight: 600, scrollTop: 80, value: 'long draft', selectionEnd: 2 };
  composer.resizeChatComposer(input, 800);
  assert.equal(input.scrollTop, 80);
});
