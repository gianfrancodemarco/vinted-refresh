import { pause, rand } from './browser.js';

const SUBMIT_SELECTORS = [
  '[data-testid="upload-form-save-button"]',
  'button[type="submit"]',
  'button:has-text("Mettre en vente")',
  'button:has-text("List item")',
  'button:has-text("Carica")',
  'button:has-text("Ajouter")',
  'button:has-text("Publish")',
];

export async function publishListing(page, baseUrl, fields, imagePaths, onProgress = () => {}) {
  await page.goto(`${baseUrl}/items/new`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await pause(page, 1500, 2500);

  if (/\/member\/signup|session-refresh|expire-cookies|\/login/i.test(page.url())) {
    throw new Error('Session invalid while opening upload form. Run `vinted-refresh login` again.');
  }

  await page.waitForSelector('[data-testid="add-photos-input"]', {
    timeout: 30000,
    state: 'attached',
  });

  if (imagePaths.length > 0) {
    const input = page.locator('[data-testid="add-photos-input"]');
    for (let i = 0; i < imagePaths.length; i++) {
      const expected = i + 1;
      onProgress(`Uploading photo ${expected}/${imagePaths.length}...`);
      let uploaded = false;

      for (let attempt = 1; attempt <= 3; attempt++) {
        await input.setInputFiles(imagePaths[i]);
        try {
          await page.waitForFunction(
            (count) =>
              document.querySelectorAll('#photos [data-testid^="image-wrapper-"], #photos img[src]')
                .length >= count,
            expected,
            { timeout: 12000 }
          );
          uploaded = true;
          break;
        } catch {
          await pause(page, 800, 1400);
        }
      }

      if (!uploaded) {
        throw new Error(`Failed to upload photo ${expected}/${imagePaths.length}`);
      }
      await pause(page, 700, 1400);
    }
  }

  onProgress('Filling title and description...');
  if (fields.title) {
    await reactFill(page, '#title', fields.title);
    await pause(page, 900, 1600);
  }
  if (fields.description) {
    await reactFill(page, '#description', fields.description);
    await pause(page, 900, 1600);
  }

  await waitForCategoryInference(page);
  await fillFormFields(page, fields, onProgress);

  onProgress(`Setting price: ${fields.price}`);
  await fillPrice(page, fields.price);
  await pause(page, 900, 1600);

  onProgress('Publishing...');
  return submitListing(page);
}

function selectAllKey() {
  return process.platform === 'darwin' ? 'Meta+A' : 'Control+A';
}

async function reactFill(page, selector, value) {
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: 'attached', timeout: 10000 });
  await locator.click();
  await page.keyboard.press(selectAllKey());
  await pause(page, 80, 160);
  await page.keyboard.press('Backspace');
  await page.keyboard.insertText(String(value));
  await pause(page, 150, 350);
}

async function fillPrice(page, price) {
  if (!price) return;
  const priceStr = String(price).replace(',', '.');
  const priceInput = page.locator('#price, [data-testid="price-input"] input').first();
  await priceInput.waitFor({ state: 'attached', timeout: 10000 });
  await priceInput.click();
  await pause(page, 120, 300);
  await setInputValue(priceInput, priceStr);
  await pause(page, 200, 500);
}

async function setInputValue(locator, value) {
  await locator.evaluate((el, nextValue) => {
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    setter?.call(el, nextValue);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: String(nextValue) }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, String(value));
}

function normText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function waitForCategoryInference(page) {
  await pause(page, 1800, 2200);
}

async function fillFormFields(page, fields, onProgress) {
  if (fields.category) {
    onProgress(`Setting category: ${fields.category}`);
    await fillCategoryField(page, fields.category, fields.categoryPath);
  } else {
    const currentCategory = await page.locator('#category').inputValue().catch(() => '');
    if (!currentCategory.trim()) {
      onProgress('Choosing first suggested category...');
      await chooseFirstSuggestedCategory(page);
    }
  }
  await pause(page, 1200, 2000);

  if (fields.videoGamePlatform) {
    onProgress(`Setting platform: ${fields.videoGamePlatform}`);
    await pickDropdownOption(page, '#video_game_platform', '.web_ui__Cell__cell', fields.videoGamePlatform);
    await pause(page, 900, 1600);
  }

  if (fields.videoGameRating) {
    onProgress(`Setting rating: ${fields.videoGameRating}`);
    await pickDropdownOption(page, '#video_game_ratings', '.web_ui__Cell__cell', fields.videoGameRating);
    await pause(page, 900, 1600);
  }

  await fillBookFields(page, fields, onProgress);

  if (fields.condition) {
    onProgress(`Setting condition: ${fields.condition}`);
    await fillConditionField(page, fields.condition, fields.conditionTestId);
    await pause(page, 900, 1600);
  }

  if (fields.size) {
    onProgress(`Setting size: ${fields.size}`);
    await pickDropdownOption(
      page,
      '#size',
      '[data-testid^="size-"].web_ui__Cell__cell, [data-testid^="suggested-size-"].web_ui__Cell__cell',
      fields.size
    );
    await pause(page, 900, 1600);
  }

  if (fields.color) {
    onProgress(`Setting color: ${fields.color}`);
    const colors = String(fields.color)
      .split(/[,;|]/)
      .map((v) => v.trim())
      .filter(Boolean);
    for (let i = 0; i < colors.length; i++) {
      await pickDropdownOption(
        page,
        '#color',
        '[data-testid^="suggested-color-"].web_ui__Cell__cell, [data-testid^="color-"].web_ui__Cell__cell',
        colors[i],
        { closeAfter: i === colors.length - 1 }
      );
      await pause(page, 700, 1200);
    }
    await page.keyboard.press('Escape').catch(() => {});
    await pause(page, 700, 1200);
  }

  if (fields.packageSizeId) {
    onProgress(`Setting parcel size...`);
    const cell = page.locator(`#package-size-${fields.packageSizeId}`).first();
    if (await cell.count()) {
      await cell.click();
      await pause(page, 900, 1600);
    }
  }

  if (fields.brand) {
    onProgress(`Setting brand: ${fields.brand}`);
    await fillBrandField(page, fields.brand);
    await pause(page, 900, 1600);
  }
}

function scoreTextMatch(cellText, target) {
  const cell = normText(cellText);
  const tgt = normText(target);
  if (!cell || !tgt) return 0;
  if (cell === tgt || cell.includes(tgt) || tgt.includes(cell)) return 100;

  const targetWords = tgt.split(' ').filter((w) => w.length > 2);
  if (targetWords.length === 0) return 0;

  let matched = 0;
  for (const word of targetWords) {
    if (cell.split(' ').some((part) => part.includes(word) || word.includes(part))) {
      matched++;
    }
  }
  return (matched / targetWords.length) * 80;
}

async function readFieldValue(page, selector) {
  return page.locator(selector).first().inputValue().catch(() => '');
}

async function closeOpenDialogs(page) {
  await page.keyboard.press('Escape').catch(() => {});
  await pause(page, 200, 400);
  await page.keyboard.press('Escape').catch(() => {});
  await pause(page, 200, 400);
}

async function fillConditionField(page, condition, conditionTestId) {
  await closeOpenDialogs(page);

  const input = page.locator('#condition').first();
  await input.scrollIntoViewIfNeeded().catch(() => {});
  await input.click();
  await pause(page, 500, 900);

  try {
    await page.waitForSelector('[data-testid^="condition-"]', { state: 'visible', timeout: 6000 });
  } catch {
    const wrapper = page.locator('.c-input:has(#condition)').first();
    if (await wrapper.count()) {
      await wrapper.click();
      await pause(page, 400, 700);
    }
    await page.waitForSelector('[data-testid^="condition-"]', { state: 'visible', timeout: 6000 });
  }

  if (conditionTestId) {
    const cell = page.locator(`[data-testid="${conditionTestId}"]`).first();
    await cell.click();
    await pause(page, 400, 700);
    if ((await readFieldValue(page, '#condition')).trim()) return;
  }

  const exact = page.locator('[data-testid^="condition-"]').filter({ hasText: condition }).first();
  if (await exact.count()) {
    await exact.click();
    await pause(page, 400, 700);
    if ((await readFieldValue(page, '#condition')).trim()) return;
  }

  const firstWord = condition.split(/\s+/)[0];
  const partial = page.locator('[data-testid^="condition-"]').filter({ hasText: firstWord }).first();
  if (await partial.count()) {
    await partial.click();
    await pause(page, 400, 700);
  }

  await page.keyboard.press('Escape').catch(() => {});

  if (!(await readFieldValue(page, '#condition')).trim()) {
    throw new Error(`Failed to set Condizioni to "${condition}"`);
  }
}

async function pickDropdownOption(page, inputSelector, cellSelector, target, options = {}) {
  const { matchMode = 'includes', closeAfter = true } = options;
  const input = page.locator(inputSelector).first();
  if (!(await input.count())) return false;

  await input.scrollIntoViewIfNeeded().catch(() => {});
  await input.click();
  await pause(page, 350, 700);

  const dropdown = page.locator('.input-dropdown:visible, .web_ui__Dialog__portal:visible:has(*)').last();
  let visible = false;
  try {
    await dropdown.waitFor({ state: 'visible', timeout: 3500 });
    visible = true;
  } catch {
    const wrapper = input.locator('xpath=ancestor::*[contains(@class,"c-input")][1]').first();
    if (await wrapper.count()) {
      await wrapper.click();
      await pause(page, 350, 700);
      try {
        await dropdown.waitFor({ state: 'visible', timeout: 3500 });
        visible = true;
      } catch {
        visible = false;
      }
    }
  }

  if (!visible) return false;

  const cells = dropdown.locator(cellSelector);
  const count = await cells.count();
  if (!count) {
    if (closeAfter) await page.keyboard.press('Escape').catch(() => {});
    return false;
  }

  const targetNorm = normText(target);
  let matchIndex = -1;
  let bestScore = -1;
  for (let i = 0; i < count; i++) {
    const cellText = await cells.nth(i).textContent();
    if (matchMode === 'exact') {
      if (normText(cellText) === targetNorm) {
        matchIndex = i;
        break;
      }
      continue;
    }

    const score = scoreTextMatch(cellText, target);
    if (score > bestScore) {
      bestScore = score;
      matchIndex = i;
    }
  }

  if (matchIndex < 0 || bestScore <= 0) {
    if (closeAfter) await page.keyboard.press('Escape').catch(() => {});
    return false;
  }

  await cells.nth(matchIndex).click();
  await pause(page, 350, 650);

  if (closeAfter) {
    await page.keyboard.press('Escape').catch(() => {});
    await pause(page, 150, 320);
  }
  return true;
}

async function fillBookFields(page, fields, onProgress) {
  if (!fields.isbn) return;

  const isbnInput = page.locator('#isbn').first();
  if (!(await isbnInput.count())) return;

  onProgress(`Setting ISBN: ${fields.isbn}`);
  await reactFill(page, '#isbn', normalizeIsbn(fields.isbn));
  await pause(page, 2000, 3500);

  try {
    await page.waitForFunction(
      () => {
        const title = document.querySelector('#book_title');
        return title instanceof HTMLInputElement && title.value.trim().length > 0;
      },
      { timeout: 8000 }
    );
  } catch {
    if (fields.bookTitle) {
      onProgress(`Setting book title: ${fields.bookTitle}`);
      await reactFill(page, '#book_title', fields.bookTitle);
      await pause(page, 900, 1600);
    }
  }

  const currentLanguage = await readFieldValue(page, '#language_book');
  if (fields.bookLanguage && normText(currentLanguage) !== normText(fields.bookLanguage)) {
    onProgress(`Setting book language: ${fields.bookLanguage}`);
    await pickDropdownOption(page, '#language_book', '.web_ui__Cell__cell', fields.bookLanguage);
    await pause(page, 900, 1600);
  }
}

function normalizeIsbn(value) {
  return String(value).replace(/[^\dXx]/g, '').toUpperCase();
}

async function fillCategoryField(page, category, categoryPath = '') {
  const categoryInput = page.locator('#category').first();
  await categoryInput.click();
  await pause(page, 400, 800);

  const searchInput = page.locator('#catalog-search-input').first();
  let useSearch = false;
  try {
    await searchInput.waitFor({ state: 'visible', timeout: 4000 });
    useSearch = await searchInput.isVisible();
  } catch {
    useSearch = false;
  }

  const searchTerm = categoryPath
    ? categoryPath
        .split(/>|›/)
        .map((part) => part.trim())
        .filter(Boolean)
        .slice(-2)
        .join(' ')
    : String(category);

  const targetInput = useSearch ? searchInput : categoryInput;
  await targetInput.click();
  await page.keyboard.press(selectAllKey());
  await pause(page, 80, 160);
  await page.keyboard.insertText(searchTerm);
  await pause(page, 1600, 2400);

  const suggestions = page.locator('[id^="catalog-suggestion-"], [id$="-result"].web_ui__Cell__cell');
  try {
    await suggestions.first().waitFor({ state: 'visible', timeout: 6000 });
  } catch {
    await page.keyboard.press('Escape').catch(() => {});
    return;
  }

  const count = await suggestions.count();
  const target = normText(category);
  const pathSegments = categoryPath
    ? categoryPath
        .split(/>|›/)
        .map((part) => normText(part))
        .filter(Boolean)
    : [];

  let pickIndex = 0;
  let bestScore = -1;
  for (let i = 0; i < count; i++) {
    const text = normText(await suggestions.nth(i).textContent());
    const lastSegment = text.split(/[›>/]/).pop()?.trim() || text;
    let score = 0;

    if (pathSegments.length) {
      for (const segment of pathSegments) {
        if (text.includes(segment)) score += 10;
      }
    } else if (text.includes(target) || target.includes(lastSegment) || lastSegment.includes(target)) {
      score = 50;
    }

    if (score > bestScore) {
      bestScore = score;
      pickIndex = i;
    }
  }

  await suggestions.nth(pickIndex).click();
  await pause(page, 1300, 1900);
  await page.keyboard.press('Escape').catch(() => {});
  await pause(page, 300, 500);
}

async function chooseFirstSuggestedCategory(page) {
  const categoryInput = page.locator('#category').first();
  await categoryInput.click();
  await pause(page, 600, 1000);

  const suggestions = page.locator('[id^="catalog-suggestion-"], [id$="-result"].web_ui__Cell__cell');
  try {
    await suggestions.first().waitFor({ state: 'visible', timeout: 6000 });
    await suggestions.first().click();
    await pause(page, 1300, 1900);
  } catch {
    await page.keyboard.press('Escape').catch(() => {});
  }
}

async function fillBrandField(page, brand) {
  const brandInput = page.locator('#brand').first();
  await brandInput.click();
  await pause(page, 600, 1100);

  const brandSearch = page.locator('#brand-search-input').first();
  await brandSearch.waitFor({ state: 'visible', timeout: 5000 });
  await brandSearch.click();
  await page.keyboard.press(selectAllKey());
  await page.keyboard.insertText(String(brand));
  await pause(page, 1100, 1700);

  const customBrand = page.locator('#custom-select-brand').first();
  if (await customBrand.isVisible().catch(() => false)) {
    await customBrand.click();
    return;
  }

  const cells = page.locator('[id^="brand-"].web_ui__Cell__cell, [id^="suggested-brand-"].web_ui__Cell__cell');
  const count = await cells.count();
  const target = normText(brand);
  for (let i = 0; i < count; i++) {
    const ariaLabel = normText(await cells.nth(i).getAttribute('aria-label'));
    const text = normText(await cells.nth(i).textContent());
    if (ariaLabel === target || text === target || ariaLabel.startsWith(target) || text.startsWith(target)) {
      await cells.nth(i).click();
      return;
    }
  }

  await page.keyboard.press('Escape').catch(() => {});
}

async function submitListing(page) {
  let submitBtn = null;
  const deadline = Date.now() + 15000;

  while (Date.now() < deadline) {
    for (const selector of SUBMIT_SELECTORS) {
      const candidates = page.locator(selector);
      const count = await candidates.count();
      for (let i = 0; i < count; i++) {
        const cand = candidates.nth(i);
        const visible = await cand.isVisible().catch(() => false);
        if (!visible) continue;
        const disabled = await cand
          .evaluate((el) => el.disabled === true || el.getAttribute('aria-disabled') === 'true')
          .catch(() => false);
        if (!disabled) {
          submitBtn = cand;
          break;
        }
      }
      if (submitBtn) break;
    }
    if (submitBtn) break;
    await pause(page, 250, 450);
  }

  if (!submitBtn) {
    throw new Error('Publish button not found or disabled');
  }

  await pause(page, 900, 1600);
  await submitBtn.scrollIntoViewIfNeeded().catch(() => {});
  await submitBtn.click({ timeout: 10000 });

  const startUrl = page.url();
  try {
    await Promise.race([
      page.waitForURL((url) => url.toString() !== startUrl, { timeout: 60000 }),
      page.waitForFunction(
        () => {
          if (/\/member\/[^/?#]+/i.test(window.location.pathname)) return true;
          const text = document.body?.innerText || '';
          return /article en vente|item listed|listing live|plus tu has d.articles|articolo in vendita/i.test(
            text
          );
        },
        { timeout: 60000 }
      ),
    ]);
  } catch {
    throw new Error('Publish did not complete — check the browser for validation errors or captcha');
  }

  return page.url();
}
