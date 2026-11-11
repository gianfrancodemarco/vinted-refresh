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
              document.querySelectorAll(
                '[data-testid^="media-select-photo-"][data-testid$="--img"], #photos [data-testid^="image-wrapper-"], #photos img[src]'
              ).length >= count,
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
    await reactFill(page, '[data-testid="title--input"], #title', fields.title);
    await pause(page, 900, 1600);
  }
  if (fields.description) {
    await reactFill(page, '[data-testid="description--input"], #description', fields.description);
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
  const priceInput = page
    .locator('[data-testid="price-input--input"], #price, [data-testid="price-input"] input')
    .first();
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
    const currentCategory = await readCategoryValue(page);
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
    const cell = page
      .locator(
        `[data-testid="${fields.packageSizeId}-package-size--cell"], #package-size-${fields.packageSizeId}`
      )
      .first();
    if (await cell.count()) {
      await cell.scrollIntoViewIfNeeded().catch(() => {});
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

// New Vinted form: dropdown buttons show the selected value in a `X--value`
// span, with a "Seleziona…" placeholder when unset.
async function readDropdownValue(page, valueTestId) {
  const text = await page
    .locator(`[data-testid="${valueTestId}"]`)
    .first()
    .textContent()
    .then((t) => (t || '').trim())
    .catch(() => '');
  if (/^(seleziona|select|sélection|wähle|choisis)/i.test(text)) return '';
  return text;
}

async function readCategoryValue(page) {
  const newValue = await readDropdownValue(page, 'catalog-select-dropdown-input--value');
  if (newValue) return newValue;
  return readFieldValue(page, '#category');
}

async function readConditionValue(page) {
  const newValue = await readDropdownValue(page, 'category-condition-single-list-input--value');
  if (newValue) return newValue;
  return readFieldValue(page, '#condition');
}

async function closeOpenDialogs(page) {
  await dismissEducationModal(page);
  await page.keyboard.press('Escape').catch(() => {});
  await pause(page, 200, 400);
  await page.keyboard.press('Escape').catch(() => {});
  await pause(page, 200, 400);
}

// Picking some options (e.g. condition "Nuovo senza cartellino") opens an
// education modal whose overlay swallows every click until dismissed.
async function dismissEducationModal(page) {
  const modal = page.locator('[data-testid*="education-modal"]:not([data-testid$="--overlay"])').first();
  if (!(await modal.isVisible().catch(() => false))) return;

  const button = page
    .locator('.web_ui__Dialog__portal button')
    .last();
  if (await button.isVisible().catch(() => false)) {
    await button.click({ timeout: 5000 }).catch(() => {});
  } else {
    await page.keyboard.press('Escape').catch(() => {});
  }
  await pause(page, 400, 700);
}

async function fillConditionField(page, condition, conditionTestId) {
  await closeOpenDialogs(page);

  const input = page
    .locator('[data-testid="category-condition-single-list-input"], #condition')
    .first();
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
    if (await cell.count()) {
      await cell.click();
      await pause(page, 400, 700);
      await dismissEducationModal(page);
      if ((await readConditionValue(page)).trim()) return;
    }
  }

  const exact = page
    .locator('[data-testid^="condition-"][data-testid$="--title"]')
    .filter({ hasText: condition })
    .first();
  if (await exact.count()) {
    await exact.click();
    await pause(page, 400, 700);
    await dismissEducationModal(page);
    if ((await readConditionValue(page)).trim()) return;
  }

  const anyMatch = page.locator('[data-testid^="condition-"]').filter({ hasText: condition }).first();
  if (await anyMatch.count()) {
    await anyMatch.click();
    await pause(page, 400, 700);
    await dismissEducationModal(page);
    if ((await readConditionValue(page)).trim()) return;
  }

  const firstWord = condition.split(/\s+/)[0];
  const partial = page.locator('[data-testid^="condition-"]').filter({ hasText: firstWord }).first();
  if (await partial.count()) {
    await partial.click();
    await pause(page, 400, 700);
    await dismissEducationModal(page);
  }

  await page.keyboard.press('Escape').catch(() => {});

  if (!(await readConditionValue(page)).trim()) {
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

const ISBN_INPUT = '[data-testid="isbn--input"], input[name="isbn"], #isbn';
const BOOK_TITLE_INPUT = '[data-testid="book_title--input"], input[name="book_title"], #book_title';
const BOOK_AUTHOR_INPUT = '[data-testid="author--input"], input[name="author"], #author';

async function fillBookFields(page, fields, onProgress) {
  if (!fields.isbn) return;

  const isbnInput = page.locator(ISBN_INPUT).first();
  if (!(await isbnInput.count())) return;

  onProgress(`Setting ISBN: ${fields.isbn}`);
  await reactFill(page, ISBN_INPUT, normalizeIsbn(fields.isbn));
  await pause(page, 2000, 3500);

  try {
    await page.waitForFunction(
      (selector) => {
        const title = document.querySelector(selector);
        return title instanceof HTMLInputElement && title.value.trim().length > 0;
      },
      BOOK_TITLE_INPUT,
      { timeout: 8000 }
    );
  } catch {
    if (fields.bookTitle) {
      onProgress(`Setting book title: ${fields.bookTitle}`);
      await reactFill(page, BOOK_TITLE_INPUT, fields.bookTitle);
      await pause(page, 900, 1600);
    }
    if (fields.bookAuthor && !(await readFieldValue(page, BOOK_AUTHOR_INPUT)).trim()) {
      onProgress(`Setting book author: ${fields.bookAuthor}`);
      await reactFill(page, BOOK_AUTHOR_INPUT, fields.bookAuthor);
      await pause(page, 900, 1600);
    }
  }

  const currentLanguage =
    (await readFieldValue(page, '#language_book')) ||
    (await readDropdownValue(page, 'isbn-language_book-single-list_search-input'));
  if (fields.bookLanguage && normText(currentLanguage) !== normText(fields.bookLanguage)) {
    onProgress(`Setting book language: ${fields.bookLanguage}`);
    await pickDropdownOption(
      page,
      '[data-testid="isbn-language_book-single-list_search-input"], #language_book',
      '.web_ui__Cell__cell',
      fields.bookLanguage
    );
    await pause(page, 900, 1600);
  }
}

function normalizeIsbn(value) {
  return String(value).replace(/[^\dXx]/g, '').toUpperCase();
}

async function fillCategoryField(page, category, categoryPath = '') {
  const newDropdown = page.locator('[data-testid="catalog-select-dropdown-input"]').first();
  if (await newDropdown.count()) {
    await fillCategoryDropdown(page, newDropdown, category, categoryPath);
    return;
  }

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

// New Vinted form: the category picker is a dropdown listing suggestion rows
// (leaf name + full path) on top, then the root categories to navigate.
async function fillCategoryDropdown(page, trigger, category, categoryPath = '') {
  await closeOpenDialogs(page);
  await trigger.scrollIntoViewIfNeeded().catch(() => {});
  await trigger.click();

  const content = page.locator('[data-testid="catalog-select-dropdown-content"]').first();
  await content.waitFor({ state: 'visible', timeout: 8000 });
  await pause(page, 700, 1200);

  const leaf = normText(category);
  const verify = async () => normText(await readCategoryValue(page)) === leaf;

  const clickRowMatching = async (target) => {
    const rows = content.locator('li');
    const count = await rows.count();
    let bestIndex = -1;
    let bestScore = -1;
    for (let i = 0; i < count; i++) {
      const text = normText(await rows.nth(i).textContent());
      if (!text) continue;
      let score = -1;
      if (text === target) score = 100;
      else if (text.startsWith(target)) score = 80;
      else if (text.includes(target)) score = 50;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
      if (score === 100) break;
    }
    if (bestIndex < 0 || bestScore < 50) return false;
    await content.locator('li').nth(bestIndex).click();
    await pause(page, 800, 1400);
    return true;
  };

  // 1) suggestion row matching the leaf name selects the category directly
  if (await clickRowMatching(leaf)) {
    if (await verify()) return;
  }

  // 2) walk the category tree following the breadcrumb path
  const segments = categoryPath
    ? categoryPath
        .split(/>|›/)
        .map((part) => normText(part))
        .filter(Boolean)
    : [];
  if (segments.length && (await content.isVisible().catch(() => false))) {
    for (const segment of segments) {
      if (!(await content.isVisible().catch(() => false))) break;
      const clicked = await clickRowMatching(segment);
      if (!clicked) break;
    }
    if (await verify()) return;
  }

  await page.keyboard.press('Escape').catch(() => {});
  await pause(page, 300, 500);

  if (!(await readCategoryValue(page)).trim()) {
    throw new Error(`Failed to set category to "${category}"`);
  }
}

async function chooseFirstSuggestedCategory(page) {
  const newDropdown = page.locator('[data-testid="catalog-select-dropdown-input"]').first();
  if (await newDropdown.count()) {
    await newDropdown.click();
    const content = page.locator('[data-testid="catalog-select-dropdown-content"]').first();
    try {
      await content.waitFor({ state: 'visible', timeout: 8000 });
    } catch {
      return;
    }
    await pause(page, 700, 1200);
    // keep clicking the first row until the dropdown closes (leaf reached)
    for (let depth = 0; depth < 6; depth++) {
      if (!(await content.isVisible().catch(() => false))) break;
      const first = content.locator('li').first();
      if (!(await first.count())) break;
      await first.click();
      await pause(page, 800, 1400);
    }
    await page.keyboard.press('Escape').catch(() => {});
    return;
  }

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
  const newDropdown = page.locator('[data-testid="brand-select-dropdown-input"]').first();
  if (await newDropdown.count()) {
    await closeOpenDialogs(page);
    await newDropdown.scrollIntoViewIfNeeded().catch(() => {});
    await newDropdown.click();

    const content = page.locator('[data-testid="brand-select-dropdown-content"]').first();
    await content.waitFor({ state: 'visible', timeout: 8000 });
    await pause(page, 500, 900);

    const search = page.locator('[data-testid="brand-search--input"]').first();
    if (await search.count()) {
      await search.click();
      await page.keyboard.press(selectAllKey());
      await page.keyboard.insertText(String(brand));
      await pause(page, 1200, 1800);
    }

    const target = normText(brand);
    const rows = content.locator('li, .web_ui__Cell__cell, [role="button"]');
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const text = normText(await rows.nth(i).textContent());
      if (text === target || text.startsWith(target)) {
        await rows.nth(i).click();
        await pause(page, 500, 900);
        return;
      }
    }

    // fall back to the first row (usually "use <brand>" / closest match)
    if (count > 0) {
      await rows.first().click();
      await pause(page, 500, 900);
      return;
    }

    await page.keyboard.press('Escape').catch(() => {});
    return;
  }

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
    const errors = await page
      .evaluate(() => {
        const texts = Array.from(
          document.querySelectorAll(
            '[data-testid$="--error"], [data-testid$="-error"], .web_ui__InputError__error, [aria-invalid="true"] ~ *, [class*="error" i]'
          )
        )
          .map((el) => (el.textContent || '').trim())
          .filter((t) => t && t.length < 200);
        return [...new Set(texts)].slice(0, 10);
      })
      .catch(() => []);
    const detail = errors.length ? ` Validation: ${errors.join(' | ')}` : '';
    throw new Error(`Publish did not complete — check the browser for validation errors or captcha.${detail}`);
  }

  return page.url();
}
