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
      const title = document.querySelector('[data-testid="title--input"], #title');
      return title instanceof HTMLInputElement && title.value.length > 0;
    },
    null,
    { timeout: 20000 }
  );

  const fields = await page.evaluate(() => {
    const val = (...sels) => {
      for (const sel of sels) {
        const el = document.querySelector(sel);
        if (el && typeof el.value === 'string' && el.value) return el.value;
      }
      return '';
    };
    // New Vinted form: selected dropdown values live in `[data-testid="X--value"]`
    // spans; when unset they show a "Seleziona…" placeholder.
    const dropdownText = (...sels) => {
      for (const sel of sels) {
        const text = document.querySelector(sel)?.textContent?.trim() || '';
        if (text && !/^(seleziona|select|sélection|wähle|choisis)/i.test(text)) return text;
      }
      return '';
    };

    const rawPrice = val('[data-testid="price-input--input"]', '#price', '[data-testid="price-input"] input');
    const price = rawPrice.replace(/[^\d,.]/g, '').replace(',', '.');

    const photoUrls = Array.from(
      document.querySelectorAll(
        '[data-testid^="media-select-photo-"] img, #photos [data-testid^="image-wrapper-"] img, #photos img'
      )
    )
      .map((img) => img.getAttribute('src'))
      .filter((src) => src && !src.startsWith('data:'));

    let packageSizeId = '';
    const checkedRadio = document.querySelector(
      'input[data-testid^="package_type_selector_"]:checked, #package_size input[type="radio"]:checked'
    );
    if (checkedRadio instanceof HTMLInputElement) {
      const testid = checkedRadio.getAttribute('data-testid') || '';
      const match = testid.match(/package_type_selector_(\d+)/) || checkedRadio.id.match(/_(\d+)$/);
      packageSizeId = match ? match[1] : '';
    }

    return {
      title: val('[data-testid="title--input"]', '#title'),
      description: val('[data-testid="description--input"]', '#description'),
      brand:
        val('#brand') ||
        dropdownText('[data-testid="brand-select-dropdown-input--value"]'),
      size:
        val('#size') ||
        dropdownText('[data-testid="size-select-dropdown-input--value"]'),
      color:
        val('#color') ||
        dropdownText('[data-testid="color-select-dropdown-input--value"]'),
      condition:
        val('#condition') ||
        dropdownText('[data-testid="category-condition-single-list-input--value"]'),
      category:
        val('#category') ||
        dropdownText('[data-testid="catalog-select-dropdown-input--value"]'),
      videoGamePlatform:
        val('#video_game_platform') ||
        dropdownText('[data-testid="video-game-platform-select-dropdown-input--value"]'),
      videoGameRating:
        val('#video_game_ratings') ||
        dropdownText('[data-testid="video-game-rating-select-dropdown-input--value"]'),
      isbn: val('#isbn', '[data-testid="isbn--input"]'),
      bookTitle: val('#book_title', '[data-testid="book_title--input"]'),
      bookAuthor: val('#author', '[data-testid="author--input"]'),
      bookLanguage:
        val('#language_book') ||
        dropdownText('[data-testid="isbn-language_book-single-list_search-input"]'),
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

  const input = page
    .locator('[data-testid="category-condition-single-list-input"], #condition')
    .first();
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

  // New form marks the current condition with a checked radio.
  const checkedId = await page.evaluate(() => {
    const radio = document.querySelector('input[data-testid^="condition-radio-"]:checked');
    const match = radio?.getAttribute('data-testid')?.match(/^condition-radio-(\d+)/);
    return match ? `condition-${match[1]}` : '';
  });
  if (checkedId) {
    await page.keyboard.press('Escape').catch(() => {});
    await pause(page, 300, 500);
    return checkedId;
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
