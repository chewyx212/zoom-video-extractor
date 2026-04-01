#!/usr/bin/env node
'use strict';

const { program } = require('commander');
const path = require('path');
const { BrowserLaunchError, ZoomExtractionError, extractVideoUrls } = require('./browser');
const { downloadVideo } = require('./downloader');
const { isValidZoomShareUrl, generateFilename } = require('./utils');

program
  .name('zoom-dl')
  .description('Download password-protected Zoom cloud recordings')
  .requiredOption('-u, --url <url>', 'Zoom recording share link')
  .requiredOption('-p, --password <password>', 'Recording access passcode')
  .option('-o, --output <dir>', 'Output directory', '.')
  .option('--browser-path <path>', 'Path to a local Chrome/Chromium executable')
  .option('--no-headless', 'Show browser window (useful for debugging)')
  .addHelpText(
    'after',
    '\nBrowser selection:\n' +
      '  Use --browser-path <path> or PUPPETEER_EXECUTABLE_PATH to point to a working Chrome install.\n'
  )
  .parse();

const opts = program.opts();

async function main() {
  const { url, password, output, headless, browserPath } = opts;

  if (!isValidZoomShareUrl(url)) {
    console.error('Error: URL does not look like a Zoom recording share link.');
    console.error('Expected format: https://zoom.us/rec/share/... or https://us06web.zoom.us/rec/share/...');
    process.exit(1);
  }

  console.log(`\nZoom Video Extractor`);
  console.log(`URL: ${url}`);
  console.log(`Output: ${path.resolve(output)}\n`);

  let result;
  try {
    result = await extractVideoUrls(url, password, { headless, browserPath });
  } catch (err) {
    if (err instanceof BrowserLaunchError) {
      console.error('\nFailed to start a browser for Zoom extraction.');
      console.error(err.message);
      process.exit(1);
    }

    if (err instanceof ZoomExtractionError) {
      console.error(`\n${err.message}`);

      if (err.kind === 'incorrect_password') {
        console.error('Double-check the passcode and try again.');
      } else if (err.kind === 'recording_unavailable') {
        console.error('The recording must still be shared and available in Zoom.');
      }

      process.exit(1);
    }

    console.error(`\nFailed to extract video URL: ${err.message}`);
    console.error('Try running with --no-headless to inspect the Zoom page.');
    process.exit(1);
  }

  const { videos, headers } = result;

  if (videos.length === 0) {
    console.error('\nNo downloadable video URLs found.');
    console.error('Suggestions:');
    console.error('  - Run with --no-headless to visually inspect the Zoom player');
    console.error('  - Try a known-good Chrome with --browser-path or PUPPETEER_EXECUTABLE_PATH');
    console.error('  - Zoom may have changed the player structure or require account login');
    process.exit(1);
  }

  console.log(`\nFound ${videos.length} video(s). Starting download...\n`);

  for (let i = 0; i < videos.length; i++) {
    const { url: videoUrl, type } = videos[i];
    const filename = generateFilename(videoUrl, i, type);
    const outputPath = path.join(output, filename);

    console.log(`[${i + 1}/${videos.length}] ${filename}`);
    try {
      await downloadVideo(videoUrl, outputPath, headers);
    } catch (err) {
      console.error(`  Failed to download: ${err.message}`);
    }
  }

  console.log('\nDone.');
}

main();
