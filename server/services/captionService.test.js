'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createGroups } = require('./captionService');
const { extractVideoId, validateRequest } = require('./videoSourceService');
const { clipRelativeWords } = require('./videoService');
const { missingFfmpegMessage } = require('./renderService');

test('extracts supported YouTube IDs and rejects lookalikes', () => {
  assert.equal(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractVideoId('https://youtu.be/dQw4w9WgXcQ?t=4'), 'dQw4w9WgXcQ');
  assert.equal(extractVideoId('https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ'), null);
});

test('rejects reversed and overly long clips', () => {
  assert.throws(() => validateRequest({ sourceUrl: 'https://youtu.be/dQw4w9WgXcQ', startTime: 20, endTime: 20 }), /End time/);
  assert.throws(() => validateRequest({ sourceUrl: 'https://youtu.be/dQw4w9WgXcQ', startTime: 0, endTime: 181 }), /limited/);
});

test('groups captions into readable short phrases', () => {
  const groups = createGroups([
    { word: 'I', start: 0, end: .1 }, { word: 'think', start: .11, end: .3 }, { word: 'artificial', start: .31, end: .6 }, { word: 'intelligence', start: .61, end: 1.0 }, { word: 'changes', start: 1.7, end: 2.0 }
  ]);
  assert.deepEqual(groups.map(group => group.map(word => word.word).join(' ')), ['I think artificial', 'intelligence', 'changes']);
});

test('keeps transcript timestamps clip-relative for trimmed audio', () => {
  const words = clipRelativeWords([{ word: 'Beginning', start: .12, end: .38 }], 30);
  assert.deepEqual(words, [{ word: 'Beginning', start: .12, end: .38 }]);
});

test('uses one clear FFmpeg setup error', () => {
  assert.equal(missingFfmpegMessage, 'FFmpeg is not installed or is not available on PATH.');
});
