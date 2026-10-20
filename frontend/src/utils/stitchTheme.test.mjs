import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = readFileSync(fileURLToPath(new URL('../index.css', import.meta.url)), 'utf8');
const root = css.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] || '';
const token = (name) => root.match(new RegExp(`--bp-color-${name}:\\s*([^;]+);`))?.[1]?.trim();
const rgb = (hex) => hex.match(/[\da-f]{2}/gi).map((part) => parseInt(part, 16) / 255);
const luminance = (hex) => rgb(hex).map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4).reduce((sum, channel, i) => sum + channel * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => { const values = [luminance(a), luminance(b)].sort((x, y) => y - x); return (values[0] + 0.05) / (values[1] + 0.05); };

test('Stitch theme exposes the approved semantic palette and keeps readable text contrast', () => {
  const expected = {
    canvas: '#f5f7fc', surface: '#ffffff', 'surface-muted': '#f8f8ff', ink: '#0f172a',
    text: '#334155', muted: '#475569', brand: '#5740ec', 'brand-strong': '#3928a4',
    accent: '#fb4b8b', paint: '#ea580c', success: '#047857', warning: '#b45309',
  };
  for (const [name, value] of Object.entries(expected)) assert.equal(token(name)?.toLowerCase(), value, `--bp-color-${name}`);
  assert.ok(contrast(token('ink'), token('canvas')) >= 4.5, 'body text on canvas must meet WCAG AA');
  assert.ok(contrast(token('text'), token('surface')) >= 4.5, 'supporting text on white must meet WCAG AA');
  assert.ok(contrast('#ffffff', token('brand')) >= 4.5, 'primary button text must meet WCAG AA');
  assert.match(root, /--bp-brand:\s*var\(--bp-color-brand\)/);
  assert.match(root, /--bp-card:\s*var\(--bp-color-surface\)/);
  assert.match(root, /--bp-line:\s*var\(--bp-color-border\)/);
});
