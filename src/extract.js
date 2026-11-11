import fs from 'node:fs';
import path from 'node:path';
import { pause } from './browser.js';

const EDIT_SELECTORS = [
  '[data-testid="item-edit-button"]',
  'button:has-text("Modifica annuncio")',
  'button:has-text("Modifier l\'annonce")',
  'button:has-text("Edit listing")',
  'a:has-text("Modifica annuncio")',
  'a:has-text("Modifier l\'annonce")',
  'a:has-text("Edit listing")',
];

export async function extractItemFields(page, itemUrl) {
  await page.goto(itemUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await pause(page, 1200, 2200);

  if (/404|not found|introuvable/i.test(await page.title())) {
    throw new Error(`Item not found: ${itemUrl}`);
  }

  const categoryPath = await page.evaluate(() => {
    const links = Array.from(
      document.querySelectorAll(
        '[data-testid*="breadcrumb"] a, nav[aria-label*="breadcrumb" i] a, .web_ui__Breadcrumbs__breadcrumb a, .web_ui__Breadcrumbs__ a'
      )
    )
      .map((link) => link.textContent?.trim())
      .filter(Boolean);

    if (links.length) return links.join(' > ');

    const crumbs = Array.from(
      document.querySelectorAll('[data-testid*="breadcrumb"] *, .web_ui__Breadcrumbs__ *')
    )
      .map((el) => el.textContent?.trim())
      .filter((text) => text && text.length < 40 && !/catalogo|vinted|home|articoli/i.test(text));

    const unique = [...new Set(crumbs)];
    return unique.length >= 2 ? unique.join(' > ') : '';
  });

  const editBtn = page.locator(EDIT_SELECTORS.join(', ')).first();
  try {
    await editBtn.waitFor({ state: 'attached', timeout: 15000 });
  } catch {
    const pageState = await page.evaluate(() => ({
      hasBuyButton: !!document.querySelector('[data-testid="item-buy-button"]'),
      hasEditButton: !!document.querySelector('[data-testid="item-edit-button"]'),
      uploadHref: document.querySelector('[data-testid="header-upload-item-button"]')?.getAttribute('href') || '',
    }));

    if (pageState.hasBuyButton && !pageState.hasEditButton) {
      if (pageState.uploadHref.includes('signup') || pageState.uploadHref.includes('register')) {
        throw new Error(
          'Session expired or invalid for the web UI. Run `vinted-refresh login` and try again.'
        );
      }
      throw new Error(
        'Edit button not found — Vinted is showing the public buyer view. Log in as the listing owner, or check that this item is yours.'
      );
    }

    throw new Error(
      'Edit button not found on the item page. The listing may be sold/removed, or you may not be logged in as the owner.'
    );
  }
  await editBtn.scrollIntoViewIfNeeded().catch(() => {});
  await editBtn.click({ timeout: 10000 });
  await pause(page, 1500, 2500);

  await page.waitForFunction(
    () => {
      const title = document.querySelector('#title');
      return title instanceof HTMLInputElement && title.value.length > 0;
    },
    { timeout: 15000 }
  );

  const fields = await page.evaluate(() => {
    const val = (sel) => document.querySelector(sel)?.value || '';
    const rawPrice = val('#price') || val('[data-testid="price-input"] input');
    const price = rawPrice.replace(/[^\d,.]/g, '').replace(',', '.');

    const photoUrls = Array.from(
      document.querySelectorAll('#photos [data-testid^="image-wrapper-"] img, #photos img')
    )
      .map((img) => img.getAttribute('src'))
      .filter((src) => src && !src.startsWith('data:'));

    const checkedRadio = document.querySelector('#package_size input[type="radio"]:checked');
    let packageSizeId = '';
    if (checkedRadio instanceof HTMLInputElement) {
      const match = checkedRadio.id.match(/_(\d+)$/);
      packageSizeId = match ? match[1] : '';
    }

    return {
      title: val('#title'),
      description: val('#description'),
      brand: val('#brand'),
      size: val('#size'),
      color: val('#color'),
      condition: val('#condition'),
      category: val('#category'),
      videoGamePlatform: val('#video_game_platform'),
      videoGameRating: val('#video_game_ratings'),
      isbn: val('#isbn'),
      bookTitle: val('#book_title'),
      bookLanguage: val('#language_book'),
      price,
      photoUrls,
      packageSizeId,
    };
  });

  if (!fields.title) {
    throw new Error('Could not read listing fields. Are you the owner of this item?');
  }

  fields.categoryPath = categoryPath;
  fields.conditionTestId = await extractConditionTestId(page, fields.condition);

  return fields;
}

async function extractConditionTestId(page, conditionLabel) {
  if (!conditionLabel) return '';

  const input = page.locator('#condition').first();
  if (!(await input.count())) return '';

  await input.scrollIntoViewIfNeeded().catch(() => {});
  await input.click();
  await pause(page, 500, 900);

  try {
    await page.waitForSelector('[data-testid^="condition-"]', { state: 'visible', timeout: 5000 });
  } catch {
    await page.keyboard.press('Escape').catch(() => {});
    return '';
  }

  const testId = await page.evaluate((label) => {
    const norm = (value) =>
      String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const target = norm(label);
    const cells = document.querySelectorAll('[data-testid^="condition-"]');
    for (const cell of cells) {
      const text = norm(cell.textContent || '');
      if (text === target || text.includes(target) || target.includes(text)) {
        return cell.getAttribute('data-testid') || '';
      }
    }
    return '';
  }, conditionLabel);

  await page.keyboard.press('Escape').catch(() => {});
  await pause(page, 300, 500);
  return testId;
}

export async function downloadImages(photoUrls, tempDir) {
  fs.mkdirSync(tempDir, { recursive: true });
  const paths = [];

  for (let i = 0; i < photoUrls.length; i++) {
    const url = photoUrls[i];
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download photo ${i + 1}: HTTP ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const ext = guessExtension(url, response.headers.get('content-type'));
    const filePath = path.join(tempDir, `photo-${String(i + 1).padStart(2, '0')}${ext}`);
    fs.writeFileSync(filePath, buffer);
    paths.push(filePath);
  }

  return paths;
}

function guessExtension(url, contentType) {
  const fromUrl = path.extname(new URL(url).pathname).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.webp'].includes(fromUrl)) {
    return fromUrl;
  }
  if (contentType?.includes('png')) return '.png';
  if (contentType?.includes('webp')) return '.webp';
  return '.jpg';
}
