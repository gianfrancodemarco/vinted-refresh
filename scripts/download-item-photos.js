#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { parseItemUrl } from '../src/url.js';

function toFullSizeUrl(url) {
  if (!url.includes('/f800/')) return url;
  const tc = url.replace(/\/t\/([^/]+)\/f800\//, '/tc/$1/').replace(/\?s=[^&]+/, '');
  return tc.endsWith('.webp') ? tc : url;
}

function photoKey(url) {
  const match = url.match(/\/t\/([^/]+)\//);
  return match ? match[1] : url;
}

function collectPhotoUrls(sources, options = {}) {
  const urls = new Map();
  const timestamps = [];

  for (const source of sources) {
    if (!source) continue;
    if (typeof source === 'string') {
      if (/images\d\.vinted\.net/.test(source) && source.includes('/t/')) {
        const key = photoKey(source);
        const tsMatch = source.match(/\/(\d{10})(?:\.|$|\?)/);
        const ts = tsMatch ? Number(tsMatch[1]) : 0;
        timestamps.push(ts);
        urls.set(key, source);
      }
      continue;
    }

    if (Array.isArray(source.photos)) {
      for (const photo of source.photos) {
        const url =
          photo.full_size_url ||
          photo.url ||
          photo.high_resolution?.url ||
          photo.image?.url;
        if (url && url.includes('/t/')) {
          urls.set(photoKey(url), url);
        }
      }
    }
  }

  let entries = [...urls.entries()];

  if (!options.includeProfilePhotos && timestamps.length > 1) {
    const mainTimestamp = timestamps.sort((a, b) => b - a)[0];
    entries = entries.filter(([, url]) => {
      const tsMatch = url.match(/\/(\d{10})(?:\.|$|\?)/);
      return !tsMatch || Number(tsMatch[1]) === mainTimestamp;
    });
  }

  return entries.map(([, url]) => url);
}

async function scrapePhotoUrls(itemUrl) {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ locale: 'it-IT' });
  const apiItems = [];

  page.on('response', async (res) => {
    if (!res.url().includes('/api/v2/items/')) return;
    try {
      const json = await res.json();
      if (json?.item) apiItems.push(json.item);
    } catch {
      // ignore non-json
    }
  });

  try {
    await page.goto(itemUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);

    const nextDataUrls = await page.evaluate(() => {
      const el = document.querySelector('#__NEXT_DATA__');
      if (!el) return [];
      const matches = el.textContent.match(/https:\/\/images\d\.vinted\.net\/[^"\\]+/g) || [];
      return matches.filter((url) => url.includes('/t/'));
    });

    const visibleUrls = await page.evaluate(() =>
      [...document.querySelectorAll('img[src*="images"][src*="vinted.net"]')]
        .map((img) => img.getAttribute('src'))
        .filter((src) => src && src.includes('/t/'))
    );

    return collectPhotoUrls([...apiItems, ...nextDataUrls, ...visibleUrls]);
  } finally {
    await browser.close();
  }
}

function guessExtension(url, contentType) {
  const fromUrl = path.extname(new URL(url).pathname).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.webp'].includes(fromUrl)) return fromUrl;
  if (contentType?.includes('webp')) return '.webp';
  if (contentType?.includes('png')) return '.png';
  return '.jpg';
}

async function downloadPhotos(photoUrls, outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });
  const saved = [];

  for (let i = 0; i < photoUrls.length; i++) {
    const candidates = [photoUrls[i], toFullSizeUrl(photoUrls[i])];
    let response = null;

    for (const url of [...new Set(candidates)]) {
      const attempt = await fetch(url);
      if (attempt.ok) {
        response = attempt;
        break;
      }
    }

    if (!response) {
      throw new Error(`Failed to download photo ${i + 1}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const ext = guessExtension(photoUrls[i], response.headers.get('content-type'));
    const filePath = path.join(outputDir, `photo-${String(i + 1).padStart(2, '0')}${ext}`);
    fs.writeFileSync(filePath, buffer);
    saved.push(filePath);
  }

  return saved;
}

async function main() {
  const itemUrl = process.argv[2];
  if (!itemUrl) {
    console.error('Usage: node scripts/download-item-photos.js <item-url> [output-dir]');
    process.exit(1);
  }

  const { itemId, itemUrl: normalizedUrl } = parseItemUrl(itemUrl);
  const outputDir = process.argv[3] || path.join(process.cwd(), 'downloads', itemId);

  console.log(`Item ${itemId}`);
  console.log('Finding photos...');
  const photoUrls = await scrapePhotoUrls(normalizedUrl);

  if (photoUrls.length === 0) {
    throw new Error('No photos found on the listing page.');
  }

  console.log(`Downloading ${photoUrls.length} photo(s) to ${outputDir}`);
  const saved = await downloadPhotos(photoUrls, outputDir);
  for (const filePath of saved) {
    console.log(`  saved ${filePath}`);
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
