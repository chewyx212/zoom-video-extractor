'use strict';

const path = require('path');

function isValidZoomShareUrl(url) {
  return /^https:\/\/([a-z0-9]+\.)?zoom\.us\/rec\/(share|play)\//.test(url);
}

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
}

function generateFilename(videoUrl, index, type) {
  try {
    const u = new URL(videoUrl);
    const base = path.basename(u.pathname.replace(/\?.*$/, ''));
    if (base && base.endsWith('.mp4')) {
      return sanitizeFilename(base);
    }
  } catch (_) {}

  const label = type ? `_${type}` : '';
  return `zoom-recording${label}-${String(index + 1).padStart(3, '0')}.mp4`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { isValidZoomShareUrl, sanitizeFilename, generateFilename, sleep };
