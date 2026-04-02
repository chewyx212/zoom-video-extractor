'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { AppValidationError, downloadRecording } = require('../src/app');

test('downloadRecording rejects invalid Zoom URLs before browser work', async () => {
  await assert.rejects(
    () => downloadRecording({ url: 'https://example.com/video', password: 'secret' }),
    err => err instanceof AppValidationError && err.message.includes('Zoom recording share link')
  );
});

test('downloadRecording requires a passcode', async () => {
  await assert.rejects(
    () => downloadRecording({ url: 'https://us06web.zoom.us/rec/share/example', password: '' }),
    err => err instanceof AppValidationError && err.message.includes('passcode')
  );
});
