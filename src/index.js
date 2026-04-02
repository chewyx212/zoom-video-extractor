#!/usr/bin/env node
'use strict';

const { program } = require('commander');
const path = require('path');
const { AppValidationError, BrowserLaunchError, ZoomExtractionError, downloadRecording } = require('./app');

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

  console.log(`\nZoom Video Extractor`);
  console.log(`URL: ${url}`);
  console.log(`Output: ${path.resolve(output)}\n`);
  try {
    const result = await downloadRecording({ url, password, output, headless, browserPath });
    console.log(`\nSaved ${result.savedFiles.length} file(s):`);
    for (const file of result.savedFiles) {
      console.log(`- ${file.outputPath}`);
    }
    console.log('\nDone.');
  } catch (err) {
    if (err instanceof AppValidationError) {
      console.error(`\n${err.message}`);
      console.error('Expected format: https://zoom.us/rec/share/... or https://us06web.zoom.us/rec/share/...');
      process.exit(1);
    }

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
}

main();
