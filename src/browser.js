import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { ensureConfigDir, getConfigDir, getStorageStatePath, loadStorageStatePath } from './config.js';

const DEFAULT_VIEWPORT = { width: 1280, height: 900 };

const STEALTH_ARGS = ['--disable-blink-features=AutomationControlled'];

const BROWSER_BINS = {
  darwin: {
    chrome: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    msedge: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  },
};

function getInstalledBrowsers() {
  if (process.platform === 'darwin') {
    return [
      { label: 'Google Chrome', bin: BROWSER_BINS.darwin.chrome },
      { label: 'Microsoft Edge', bin: BROWSER_BINS.darwin.msedge },
    ].filter(({ bin }) => fs.existsSync(bin));
  }

  return [
    { label: 'Google Chrome', bin: 'google-chrome' },
    { label: 'Microsoft Edge', bin: 'microsoft-edge' },
  ];
}

async function waitForCdpPort(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/json/version`, (res) => {
          res.resume();
          resolve();
        });
        req.on('error', reject);
        req.setTimeout(1000, () => {
          req.destroy();
          reject(new Error('timeout'));
        });
      });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  throw new Error('Timed out waiting for browser to start');
}

async function openBrowserForLogin(baseUrl) {
  const profileDir = path.join(getConfigDir(), 'session-profile');
  fs.mkdirSync(profileDir, { recursive: true });

  const browsers = getInstalledBrowsers();
  if (browsers.length === 0) {
    throw new Error('Install Google Chrome or Microsoft Edge to log in.');
  }

  let lastError = null;

  for (const { label, bin } of browsers) {
    const port = 9222 + Math.floor(Math.random() * 1000);
    const proc = spawn(
      bin,
      [
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profileDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        baseUrl,
      ],
      { stdio: 'ignore' }
    );

    try {
      await waitForCdpPort(port);
      return { proc, port, label };
    } catch (err) {
      lastError = err;
      proc.kill('SIGTERM');
    }
  }

  throw lastError || new Error('Could not open a browser for login.');
}

async function launchStealthBrowser(headless = false) {
  const channels = ['chrome', 'msedge'];
  for (const channel of channels) {
    try {
      return await chromium.launch({
        headless,
        channel,
        ignoreDefaultArgs: ['--enable-automation'],
        args: STEALTH_ARGS,
      });
    } catch {
      // try next channel
    }
  }

  return chromium.launch({
    headless,
    ignoreDefaultArgs: ['--enable-automation'],
    args: STEALTH_ARGS,
  });
}

export async function launchBrowser(options = {}) {
  return launchStealthBrowser(options.headless ?? false);
}

export async function createContext(browser, options = {}) {
  const context = await browser.newContext({
    locale: options.locale ?? 'it-IT',
    viewport: DEFAULT_VIEWPORT,
    storageState: options.storageState,
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  return context;
}

export async function withAuthenticatedContext(baseUrl, fn, options = {}) {
  const storageState = loadStorageStatePath();
  const browser = await launchBrowser({ headless: options.headless ?? false });

  try {
    const context = await createContext(browser, { storageState });
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1000);

    if (isAuthRedirect(page.url())) {
      throw new Error('Session expired or invalid. Run `vinted-refresh login` again.');
    }

    return await fn({ browser, context, page });
  } finally {
    await browser.close().catch(() => {});
  }
}

export function isAuthRedirect(url) {
  return /session-refresh|expire-cookies|member\/signup|\/login/i.test(url);
}

export async function interactiveLogin(baseUrl) {
  ensureConfigDir();
  const storagePath = getStorageStatePath();

  console.log('Opening Chrome — log in to Vinted, then press Enter here.');
  console.log('Tip: Google/Apple login works here. Use your normal sign-in method.');

  const { proc, port, label } = await openBrowserForLogin(baseUrl);

  try {
    await waitForEnter('Press Enter after you are logged in... ');

    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const context = browser.contexts()[0];
    if (!context) {
      throw new Error(`Could not read session from ${label}`);
    }

    const page = context.pages()[0];
    if (!page || isAuthRedirect(page.url())) {
      throw new Error('Still on login/signup page. Complete login and run `vinted-refresh login` again.');
    }

    await context.storageState({ path: storagePath });
    console.log(`Session saved to ${storagePath}`);
    await browser.close().catch(() => {});
  } finally {
    proc.kill('SIGTERM');
  }
}

function waitForEnter(message) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      resolve();
      return;
    }
    process.stdin.setEncoding('utf8');
    if (process.stdin.isPaused()) {
      process.stdin.resume();
    }
    process.stdout.write(message);
    process.stdin.once('data', () => resolve());
  });
}

export function makeTempDir(prefix = 'vinted-refresh-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function rand(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export async function pause(page, min = 400, max = 900) {
  await page.waitForTimeout(rand(min, max));
}
