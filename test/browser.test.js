'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  BrowserLaunchError,
  extractUrlsFromJson,
  isDownloadableRecordingUrl,
  launchBrowserWithPuppeteer,
} = require('../src/browser');
const { generateFilename, isValidZoomShareUrl } = require('../src/utils');

test('isValidZoomShareUrl accepts Zoom regional share links', () => {
  assert.equal(
    isValidZoomShareUrl(
      'https://us06web.zoom.us/rec/share/O6nMx7FYnkvPuvgF2AImGYzKIcgnXieMDH7mQ59H_D7pKLenxdG1jElxmE482JUv.DR6aLJVABHkhQDC0'
    ),
    true
  );
});

test('generateFilename keeps the original mp4 basename', () => {
  assert.equal(
    generateFilename(
      'https://ssrweb.zoom.us/replay02/2026/03/04/example/GMT20260304-114752_Recording_1920x1080.mp4?response-content-type=video%2Fmp4',
      0,
      'recording'
    ),
    'GMT20260304-114752_Recording_1920x1080.mp4'
  );
});

test('extractUrlsFromJson keeps downloadable recordings and ignores thumbnails', () => {
  const mp4Url =
    'https://ssrweb.zoom.us/replay02/2026/03/04/example/GMT20260304-114752_Recording_1920x1080.mp4?response-content-type=video%2Fmp4';
  const m3u8Url =
    'https://ssrweb.zoom.us/replay02/2026/03/04/example/GMT20260304-114752_Recording_1920x1080.m3u8?response-content-type=application%2Fvnd.apple.mpegurl';
  const jpgUrl =
    'https://ssrweb.zoom.us/replay02/2026/03/04/example/tb/GMT20260304-114752_M1.jpg?response-content-type=image%2Fjpeg';

  const payload = {
    recording: {
      videoUrl: mp4Url,
      playlistUrl: m3u8Url,
      posterUrl: jpgUrl,
    },
    thumbnails: [jpgUrl],
  };

  const results = [];
  extractUrlsFromJson(payload, results);

  assert.deepEqual(
    results.map(result => result.url),
    [mp4Url, m3u8Url]
  );
  assert.equal(results.every(result => isDownloadableRecordingUrl(result.url)), true);
  assert.equal(results.some(result => result.url === jpgUrl), false);
});

test('extractUrlsFromJson deduplicates the same recording path with different signatures', () => {
  const firstSignedUrl =
    'https://ssrweb.zoom.us/replay02/2026/03/04/example/GMT20260304-114752_Recording_1920x1080.mp4?Signature=first';
  const secondSignedUrl =
    'https://ssrweb.zoom.us/replay02/2026/03/04/example/GMT20260304-114752_Recording_1920x1080.mp4?Signature=second';
  const results = [];

  extractUrlsFromJson([firstSignedUrl, secondSignedUrl], results);

  assert.deepEqual(results, [{ url: firstSignedUrl, type: 'recording' }]);
});

test('launchBrowserWithPuppeteer reports actionable setup help when every candidate fails', async () => {
  const fakePuppeteer = {
    executablePath() {
      return '/broken/puppeteer/chrome';
    },
    async launch({ executablePath }) {
      throw new Error(`unable to start ${executablePath}`);
    },
  };

  await assert.rejects(
    () => launchBrowserWithPuppeteer(fakePuppeteer, { headless: true, browserPath: '/custom/chrome' }),
    err =>
      err instanceof BrowserLaunchError &&
      err.message.includes('npx puppeteer browsers install chrome') &&
      err.message.includes('--browser-path /path/to/chrome') &&
      err.message.includes('PUPPETEER_EXECUTABLE_PATH')
  );
});
