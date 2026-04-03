'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const { AppValidationError, BrowserLaunchError, ZoomExtractionError, downloadRecording } = require('./app');

const publicDir = path.join(__dirname, '..', 'public');
const defaultDownloadDir = path.join(__dirname, '..', 'downloads');
const defaultHost = process.env.HOST || '0.0.0.0';
const defaultPort = parseInt(process.env.PORT, 10) || 3000;

function resolveDownloadPath(downloadDir, name) {
  if (!name) {
    return null;
  }

  const normalizedName = path.basename(name);
  if (!normalizedName || normalizedName === '.' || normalizedName !== name) {
    return null;
  }

  return path.join(downloadDir, normalizedName);
}

function listDownloads(downloadDir = defaultDownloadDir) {
  if (!fs.existsSync(downloadDir)) {
    return [];
  }

  return fs
    .readdirSync(downloadDir)
    .filter(name => /\.(mp4|m4v|mov|m3u8)$/i.test(name))
    .map(name => {
      const fullPath = path.join(downloadDir, name);
      const stats = fs.statSync(fullPath);
      return {
        name,
        serverPath: fullPath,
        downloadUrl: `/downloads/${encodeURIComponent(name)}`,
        sizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

function createApp({ downloadDir = defaultDownloadDir } = {}) {
  const app = express();

  app.use(express.json());
  app.use(express.static(publicDir));

  app.get('/api/downloads', (_req, res) => {
    res.json({ downloads: listDownloads(downloadDir) });
  });

  app.get('/downloads/:name', (req, res) => {
    const fullPath = resolveDownloadPath(downloadDir, req.params.name);
    if (!fullPath || !fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
      res.status(404).json({ ok: false, error: 'Requested file was not found.' });
      return;
    }

    res.download(fullPath, path.basename(fullPath));
  });

  app.post('/api/download', async (req, res) => {
    try {
      const { url, password, filename, browserPath } = req.body || {};

      const result = await downloadRecording({
        url,
        password,
        filename,
        browserPath,
        output: downloadDir,
        headless: true,
      });

      const downloads = listDownloads(downloadDir);
      const files = result.savedFiles.map(file => ({
        filename: file.filename,
        outputPath: file.outputPath,
        sourceUrl: file.sourceUrl,
        downloadUrl: `/downloads/${encodeURIComponent(file.filename)}`,
      }));

      res.json({
        ok: true,
        message: `Saved ${result.savedFiles.length} file(s) to ${result.outputDir}.`,
        files,
        downloads,
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

  return app;
}

function startServer({ host = defaultHost, port = defaultPort, downloadDir = defaultDownloadDir } = {}) {
  const app = createApp({ downloadDir });
  return app.listen(port, host, () => {
    console.log(`Zoom downloader UI running on ${host}:${port}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  createApp,
  listDownloads,
  resolveDownloadPath,
  startServer,
};
