import { pause } from './browser.js';

const HIDE_SELECTORS = [
  '[data-testid="item-hide-button"]',
  'button:has-text("Masquer")',
  'button:has-text("Hide")',
  'button:has-text("Hide item")',
  'button:has-text("Nascondi")',
  'button:has-text("Ocultar")',
];

const CONFIRM_SELECTORS = [
  'button:has-text("Masquer")',
  'button:has-text("Hide")',
  'button:has-text("Confirm")',
  'button:has-text("Conferma")',
  'button:has-text("Confirmer")',
  '[data-testid="confirm-button"]',
];

async function openItemActionsMenu(page) {
  const menuTriggers = [
    '[data-testid="item-actions-button"]',
    'button[aria-label*="more" i]',
    'button[aria-label*="actions" i]',
    'button:has-text("⋯")',
    'button:has-text("...")',
  ];

  for (const selector of menuTriggers) {
    const trigger = page.locator(selector).first();
    if (await trigger.count()) {
      await trigger.click({ timeout: 5000 }).catch(() => {});
      await pause(page, 400, 800);
      return;
    }
  }
}

export async function hideListing(page, itemUrl, itemId) {
  await page.goto(itemUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await pause(page, 1200, 2000);

  let hideBtn = page.locator(HIDE_SELECTORS.join(', ')).first();
  if (!(await hideBtn.count())) {
    await openItemActionsMenu(page);
    hideBtn = page.locator(HIDE_SELECTORS.join(', ')).first();
  }

  if (!(await hideBtn.count())) {
    throw new Error(
      'Hide button not found on item page. The new listing was created; hide the old one manually.'
    );
  }

  await hideBtn.scrollIntoViewIfNeeded().catch(() => {});
  await hideBtn.click({ timeout: 10000 });
  await pause(page, 700, 1200);

  const confirmBtn = page.locator(CONFIRM_SELECTORS.join(', ')).last();
  if (await confirmBtn.count()) {
    await confirmBtn.click({ timeout: 8000 }).catch(() => {});
  }

  try {
    await page.waitForFunction(
      (id) => {
        const text = document.body?.innerText || '';
        return (
          /hidden|masqu|nascosto|oculto/i.test(text) ||
          !window.location.href.includes(String(id))
        );
      },
      itemId,
      { timeout: 10000 }
    );
  } catch {
    // Hide confirmation UI varies; best-effort only.
  }
}
