'use strict';

const path = require('path');
const { BrowserLaunchError, ZoomExtractionError, extractVideoUrls } = require('./browser');
const { downloadVideo } = require('./downloader');
const { generateFilename, isValidZoomShareUrl, sanitizeFilename } = require('./utils');

class AppValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AppValidationError';
  }
}

function ensureFilename(filename, videoUrl, index, type) {
  if (!filename) {
    return generateFilename(videoUrl, index, type);
  }

  const trimmed = sanitizeFilename(String(filename));
  if (!trimmed) {
    throw new AppValidationError('Please provide a valid filename.');
  }

  const extension = path.extname(new URL(videoUrl).pathname) || '.mp4';
  return path.extname(trimmed) ? trimmed : `${trimmed}${extension}`;
}

async function downloadRecording({
  url,
  password,
  output = '.',
  headless = true,
  browserPath,
  filename,
} = {}) {
  if (!url || !isValidZoomShareUrl(url)) {
    throw new AppValidationError('URL does not look like a Zoom recording share link.');
  }

  if (!password) {
    throw new AppValidationError('Recording access passcode is required.');
  }

  const result = await extractVideoUrls(url, password, { headless, browserPath });
  const { videos, headers } = result;

  if (videos.length === 0) {
    throw new ZoomExtractionError(
      'no_video_found',
      'No downloadable video URLs found. Zoom may have changed the player or require account login.'
    );
  }

  const savedFiles = [];

  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    const resolvedFilename = ensureFilename(
      videos.length === 1 ? filename : filename ? `${filename}-${i + 1}` : '',
      video.url,
      i,
      video.type
    );
    const outputPath = path.join(output, resolvedFilename);

    await downloadVideo(video.url, outputPath, headers);
    savedFiles.push({
      filename: resolvedFilename,
      outputPath: path.resolve(outputPath),
      sourceUrl: video.url,
    });
  }

  return {
    outputDir: path.resolve(output),
    savedFiles,
    videoCount: videos.length,
  };
}

module.exports = {
  AppValidationError,
  BrowserLaunchError,
  ZoomExtractionError,
  downloadRecording,
};
