'use strict';

const fs = require('fs');
const puppeteer = require('puppeteer');
const { sleep } = require('./utils');

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const COMMON_MAC_CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

const PASSWORD_SELECTORS = [
  '#passcode',
  'input[name="passcode"]',
  'input[type="password"]',
  '#password',
  'input[placeholder*="assword"]',
  'input[placeholder*="asscode"]',
];

const SUBMIT_SELECTORS = [
  'button[type="submit"]',
  '#passcode_btn',
  'button.submit',
  'input[type="submit"]',
  'button.btn-primary',
];

class BrowserLaunchError extends Error {
  constructor(message, attempts = []) {
    super(message);
    this.name = 'BrowserLaunchError';
    this.attempts = attempts;
  }
}

class ZoomExtractionError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = 'ZoomExtractionError';
    this.kind = kind;
  }
}

function isDownloadableRecordingUrl(str) {
  if (typeof str !== 'string') return false;

  try {
    const url = new URL(str);
    if (!/^https?:$/.test(url.protocol)) return false;

    return /\.(mp4|m3u8)$/i.test(url.pathname);
  } catch (_) {
    return false;
  }
}

function getRecordingIdentity(urlString) {
  try {
    const url = new URL(urlString);
    return `${url.origin}${url.pathname}`.toLowerCase();
  } catch (_) {
    return urlString;
  }
}

function addRecordingUrl(url, results, type = 'recording') {
  if (!isDownloadableRecordingUrl(url)) return false;
  const identity = getRecordingIdentity(url);
  if (results.find(result => getRecordingIdentity(result.url) === identity)) return false;

  results.push({ url, type });
  return true;
}

function extractUrlsFromJson(obj, results, depth = 0) {
  if (depth > 15) return;
  if (typeof obj === 'string') {
    addRecordingUrl(obj, results);
    return;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) extractUrlsFromJson(item, results, depth + 1);
    return;
  }
  if (obj && typeof obj === 'object') {
    for (const val of Object.values(obj)) extractUrlsFromJson(val, results, depth + 1);
  }
}

function getBrowserLaunchCandidates(puppeteerImpl, browserPath) {
  const candidates = [];
  const seen = new Set();

  function addCandidate(path, source, { checkExists = false } = {}) {
    if (!path || seen.has(path)) return;
    if (checkExists && !fs.existsSync(path)) return;

    seen.add(path);
    candidates.push({ path, source });
  }

  addCandidate(browserPath, '--browser-path');
  addCandidate(process.env.PUPPETEER_EXECUTABLE_PATH, 'PUPPETEER_EXECUTABLE_PATH');

  if (process.platform === 'darwin') {
    for (const path of COMMON_MAC_CHROME_PATHS) {
      addCandidate(path, 'system Chrome', { checkExists: true });
    }
  }

  try {
    addCandidate(puppeteerImpl.executablePath(), 'puppeteer bundled browser');
  } catch (_) {}

  return candidates;
}

async function launchBrowserWithPuppeteer(puppeteerImpl, { headless = true, browserPath } = {}) {
  const attempts = [];
  const candidates = getBrowserLaunchCandidates(puppeteerImpl, browserPath);

  for (const candidate of candidates) {
    console.log(`[browser] Launching browser using ${candidate.source}: ${candidate.path}`);

    try {
      const browser = await puppeteerImpl.launch({
        headless: headless ? 'new' : false,
        executablePath: candidate.path,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
      });

      const version = await browser.version().catch(() => '');
      if (version) {
        console.log(`[browser] Browser ready: ${version}`);
      }

      return { browser, executablePath: candidate.path };
    } catch (err) {
      const reason = err && err.message ? err.message.split('\n')[0] : String(err);
      attempts.push({ ...candidate, reason });
      console.log(`[browser] Launch failed for ${candidate.path}: ${reason}`);
    }
  }

  const detailLines = attempts
    .map(attempt => `- ${attempt.source}: ${attempt.path}\n  ${attempt.reason}`)
    .join('\n');

  throw new BrowserLaunchError(
    `Failed to launch a working browser executable.\n` +
      `Tried:\n${detailLines}\n\n` +
      `The bundled Puppeteer browser may be broken. Reinstall it with:\n` +
      `  npx puppeteer browsers install chrome\n\n` +
      `You can also point the downloader to a working Chrome with:\n` +
      `  --browser-path /path/to/chrome\n` +
      `or set PUPPETEER_EXECUTABLE_PATH.`,
    attempts
  );
}

async function extractVideoUrls(shareUrl, password, { headless = true, browserPath } = {}) {
  const { browser } = await launchBrowserWithPuppeteer(puppeteer, { headless, browserPath });

  const page = await browser.newPage();
  await page.setUserAgent(USER_AGENT);
  await page.setViewport({ width: 1280, height: 800 });

  // Hide webdriver property
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const videoUrls = [];
  const capturedHeaders = {};

  // Intercept responses to find video URLs
  page.on('response', async response => {
    const url = response.url();
    const contentType = response.headers()['content-type'] || '';

    if (isDownloadableRecordingUrl(url)) {
      if (addRecordingUrl(url, videoUrls)) {
        console.log(`[browser] Found video URL via response: ${url.substring(0, 80)}...`);
      }
      return;
    }

    if (contentType.startsWith('video/')) {
      if (addRecordingUrl(url, videoUrls)) {
        console.log(`[browser] Found video URL via content-type: ${url.substring(0, 80)}...`);
      }
      return;
    }

    // Parse Zoom recording JSON responses for embedded downloadable URLs.
    if (contentType.includes('application/json') && url.includes('/nws/recording/')) {
      try {
        const body = await response.text();
        const data = JSON.parse(body);
        const before = videoUrls.length;
        extractUrlsFromJson(data, videoUrls);
        if (videoUrls.length > before) {
          console.log(`[browser] Found ${videoUrls.length - before} video URL(s) in JSON response from ${url.substring(0, 60)}`);
        }
      } catch (_) {}
    }
  });

  try {
    console.log('[browser] Navigating to share link...');
    await page.goto(shareUrl, { waitUntil: 'networkidle2', timeout: 45000 });

    // Check for password form
    let passwordInput = null;
    for (const sel of PASSWORD_SELECTORS) {
      passwordInput = await page.$(sel);
      if (passwordInput) {
        console.log(`[browser] Password form detected (selector: ${sel})`);
        break;
      }
    }

    if (passwordInput) {
      console.log('[browser] Entering password...');
      await passwordInput.click({ clickCount: 3 });
      await passwordInput.type(password, { delay: 60 });

      // Find and click submit
      let submitted = false;
      for (const sel of SUBMIT_SELECTORS) {
        const btn = await page.$(sel);
        if (btn) {
          console.log(`[browser] Clicking submit (selector: ${sel})`);
          await btn.click();
          submitted = true;
          break;
        }
      }

      if (!submitted) {
        // Try pressing Enter
        console.log('[browser] No submit button found, pressing Enter...');
        await passwordInput.press('Enter');
      }

      // Wait for navigation or content to load
      await Promise.race([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
        page.waitForSelector('video', { timeout: 30000 }),
        sleep(15000),
      ]).catch(() => {});

      // Check for wrong password
      const pageText = await page.evaluate(() => document.body.innerText).catch(() => '');
      if (
        (pageText.toLowerCase().includes('incorrect') ||
          pageText.toLowerCase().includes('invalid') ||
          pageText.toLowerCase().includes('wrong password')) &&
        videoUrls.length === 0
      ) {
        throw new ZoomExtractionError('incorrect_password', 'Incorrect password. Please check and try again.');
      }
    } else {
      console.log('[browser] No password form found, waiting for video to load...');
    }

    // Check for expired / unavailable link
    const pageText = await page.evaluate(() => document.body.innerText).catch(() => '');
    if (
      pageText.includes('no longer available') ||
      pageText.includes('This recording has expired') ||
      pageText.includes('page not found')
    ) {
      throw new ZoomExtractionError('recording_unavailable', 'This recording link has expired or is no longer available.');
    }

    // Wait for video element to appear
    console.log('[browser] Waiting for video player...');
    await page.waitForSelector('video', { timeout: 25000 }).catch(() => {
      console.log('[browser] Video element not found in DOM, continuing...');
    });

    // Give extra time for XHR/fetch video config to load
    await sleep(6000);

    // DOM fallback: check video element src
    const domVideoUrls = await page.evaluate(() => {
      const results = [];
      document.querySelectorAll('video').forEach(v => {
        if (v.currentSrc && v.currentSrc.startsWith('http')) results.push(v.currentSrc);
        if (v.src && v.src.startsWith('http')) results.push(v.src);
        v.querySelectorAll('source').forEach(s => {
          if (s.src && s.src.startsWith('http')) results.push(s.src);
        });
      });
      return results;
    }).catch(() => []);

    for (const url of domVideoUrls) {
      if (addRecordingUrl(url, videoUrls)) {
        console.log(`[browser] Found video URL via DOM: ${url.substring(0, 80)}...`);
      }
    }

    // Extract session cookies
    const cookies = await page.cookies();
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    capturedHeaders['Cookie'] = cookieString;
    capturedHeaders['Referer'] = shareUrl;
    capturedHeaders['User-Agent'] = USER_AGENT;
    capturedHeaders['Origin'] = new URL(shareUrl).origin;

    if (videoUrls.length === 0) {
      // Last resort: dump all network URLs seen
      console.log('[browser] No video URLs captured via normal methods.');
      console.log('[browser] Current page URL:', page.url());
    }

  } finally {
    await browser.close();
  }

  return {
    videos: videoUrls,
    headers: capturedHeaders,
  };
}

module.exports = {
  BrowserLaunchError,
  ZoomExtractionError,
  extractUrlsFromJson,
  extractVideoUrls,
  isDownloadableRecordingUrl,
  launchBrowserWithPuppeteer,
};
