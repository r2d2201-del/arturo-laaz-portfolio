import test from 'node:test';
import assert from 'node:assert/strict';
import { clipBounds, clipTime, sourceClipStart } from '../admin/video-preview.mjs';

test('clip selection stays within a full five-second window, including fractional and short videos', () => {
  assert.deepEqual(clipBounds(99, 8), { start: 3, end: 8, max: 3, known: true });
  assert.deepEqual(clipBounds(2, 3.25), { start: 0, end: 3.25, max: 0, known: true });
  assert.equal(clipBounds(10, 8.06).start, 3);
  assert.equal(clipBounds(-1, 8).start, 0);
  assert.equal(clipBounds(2.34, NaN).start, 2.3);
  assert.equal(clipBounds(50000, Infinity).start, 36000);
  assert.equal(clipTime(59.96), '1:00.0');
  assert.equal(sourceClipStart({ preview: 'https://res.cloudinary.com/cloud/video/upload/ac_none,so_12.3,du_5,f_mp4/v42/video.mp4' }), 12.3);
  assert.equal(sourceClipStart({ preview: 'assets/videos/video_preview.mp4' }), 0);
});
