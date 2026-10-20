import test from 'node:test';
import assert from 'node:assert/strict';

test('service artwork covers the approved family and never substitutes painting for an unknown trade', async () => {
  const { serviceArtwork, resolveServiceArtwork } = await import('./serviceArtwork.js');
  assert.equal(Object.keys(serviceArtwork).length, 7);
  assert.equal(resolveServiceArtwork('False Ceiling'), '/service-art/false-ceiling.webp');
  assert.equal(resolveServiceArtwork('FALSE_CEILING'), '/service-art/false-ceiling.webp');
  assert.equal(resolveServiceArtwork('plumbing'), '/service-art/plumbing.webp');
  assert.equal(resolveServiceArtwork('gardening'), null);
  assert.equal(resolveServiceArtwork(null), null);
});
