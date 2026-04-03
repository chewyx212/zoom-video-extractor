'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp, listDownloads, resolveDownloadPath } = require('../src/server');

test('listDownloads includes a browser download URL', () => {
  const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zoom-server-list-'));
  const filePath = path.join(downloadDir, 'Lesson 5.mp4');

  fs.writeFileSync(filePath, 'video');

  try {
    const [file] = listDownloads(downloadDir);
    assert.equal(file.name, 'Lesson 5.mp4');
    assert.equal(file.downloadUrl, '/downloads/Lesson%205.mp4');
    assert.equal(file.serverPath, filePath);
  } finally {
    fs.rmSync(downloadDir, { recursive: true, force: true });
  }
});

test('resolveDownloadPath blocks traversal attempts', () => {
  assert.equal(resolveDownloadPath('/tmp/downloads', '../secret.mp4'), null);
});

test('download route serves a saved file as an attachment', async t => {
  const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zoom-server-route-'));
  const filename = 'Lesson 6.mp4';
  const filePath = path.join(downloadDir, filename);

  fs.writeFileSync(filePath, 'video');

  const app = createApp({ downloadDir });
  const server = app.listen(0, '127.0.0.1');

  t.after(() => {
    server.close();
    fs.rmSync(downloadDir, { recursive: true, force: true });
  });

  await new Promise(resolve => server.once('listening', resolve));

  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/downloads/${encodeURIComponent(filename)}`);

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-disposition') || '', /attachment/i);
  assert.equal(await response.text(), 'video');
});
