'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const { AppValidationError, BrowserLaunchError, ZoomExtractionError, downloadRecording } = require('./app');

const app = express();
const publicDir = path.join(__dirname, '..', 'public');
const defaultDownloadDir = path.join(__dirname, '..', 'downloads');
const host = process.env.HOST || '0.0.0.0';
const port = parseInt(process.env.PORT, 10) || 3000;

app.use(express.json());
app.use(express.static(publicDir));

function listDownloads() {
  if (!fs.existsSync(defaultDownloadDir)) {
    return [];
  }

  return fs
    .readdirSync(defaultDownloadDir)
    .filter(name => /\.(mp4|m4v|mov|m3u8)$/i.test(name))
    .map(name => {
      const fullPath = path.join(defaultDownloadDir, name);
      const stats = fs.statSync(fullPath);
      return {
        name,
        path: fullPath,
        sizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

app.get('/api/downloads', (_req, res) => {
  res.json({ downloads: listDownloads() });
});

app.post('/api/download', async (req, res) => {
  try {
    const { url, password, filename, browserPath } = req.body || {};

    const result = await downloadRecording({
      url,
      password,
      filename,
      browserPath,
      output: defaultDownloadDir,
      headless: true,
    });

    res.json({
      ok: true,
      message: `Saved ${result.savedFiles.length} file(s) to ${result.outputDir}.`,
      files: result.savedFiles,
      downloads: listDownloads(),
    });
  } catch (err) {
    const status =
      err instanceof AppValidationError ||
      err instanceof BrowserLaunchError ||
      err instanceof ZoomExtractionError
        ? 400
        : 500;

    res.status(status).json({
      ok: false,
      error: err.message || 'Unexpected download failure.',
    });
  }
});

app.use((_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(port, host, () => {
  console.log(`Zoom downloader UI running on ${host}:${port}`);
});
