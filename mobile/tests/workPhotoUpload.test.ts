import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkPhotoUploadParts } from '../src/core/workPhotoUpload.ts';

test('builds the existing work-photo multipart contract without changing photo metadata', () => {
  const parts = createWorkPhotoUploadParts(18, {
    uri: 'file:///camera/progress.jpg', name: 'progress.jpg', mimeType: 'image/jpeg',
  }, 'PROGRESS', 'Living room', 'First coat complete');

  assert.deepEqual(parts, {
    fields: { schedule: '18', stage: 'PROGRESS', area: 'Living room', caption: 'First coat complete' },
    image: { uri: 'file:///camera/progress.jpg', name: 'progress.jpg', type: 'image/jpeg' },
  });
});
