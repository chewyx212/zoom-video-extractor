'use strict';

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { SingleBar, Presets } = require('cli-progress');

function downloadVideo(videoUrl, outputPath, headers = {}) {
  return new Promise((resolve, reject) => {
    _download(videoUrl, outputPath, headers, 0, resolve, reject);
  });
}

function _download(videoUrl, outputPath, headers, redirectCount, resolve, reject) {
  if (redirectCount > 10) {
    return reject(new Error('Too many redirects'));
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(videoUrl);
  } catch (e) {
    return reject(new Error(`Invalid URL: ${videoUrl}`));
  }

  const lib = parsedUrl.protocol === 'https:' ? https : http;
  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
    path: parsedUrl.pathname + parsedUrl.search,
    method: 'GET',
    headers: {
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      Connection: 'keep-alive',
      ...headers,
    },
  };

  const req = lib.request(options, response => {
    // Handle redirects
    if (
      response.statusCode >= 300 &&
      response.statusCode < 400 &&
      response.headers.location
    ) {
      const redirectUrl = response.headers.location.startsWith('http')
        ? response.headers.location
        : `${parsedUrl.origin}${response.headers.location}`;
      console.log(`[downloader] Redirect ${response.statusCode} -> ${redirectUrl.substring(0, 80)}`);
      response.resume(); // discard response body
      return _download(redirectUrl, outputPath, headers, redirectCount + 1, resolve, reject);
    }

    if (response.statusCode !== 200) {
      response.resume();
      return reject(new Error(`Download failed: HTTP ${response.statusCode} for ${videoUrl.substring(0, 80)}`));
    }

    const totalBytes = parseInt(response.headers['content-length'], 10) || 0;
    let receivedBytes = 0;

    const bar = new SingleBar(
      {
        format:
          ' Downloading |{bar}| {percentage}% | {receivedMB}/{totalMB} MB | ETA: {eta}s',
        hideCursor: true,
      },
      Presets.shades_classic
    );

    const totalMB = totalBytes ? (totalBytes / 1048576).toFixed(1) : '?';
    bar.start(totalBytes || 100, 0, { receivedMB: '0.0', totalMB });

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const fileStream = fs.createWriteStream(outputPath);

    response.on('data', chunk => {
      receivedBytes += chunk.length;
      const receivedMB = (receivedBytes / 1048576).toFixed(1);
      if (totalBytes) {
        bar.update(receivedBytes, { receivedMB, totalMB });
      } else {
        bar.update(50, { receivedMB, totalMB: '?' });
      }
    });

    response.pipe(fileStream);

    fileStream.on('finish', () => {
      bar.stop();
      console.log(`\n[downloader] Saved to: ${outputPath}`);
      resolve(outputPath);
    });

    fileStream.on('error', err => {
      bar.stop();
      reject(err);
    });
  });

  req.on('error', reject);
  req.end();
}

module.exports = { downloadVideo };
