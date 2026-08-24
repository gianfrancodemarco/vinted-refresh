import { interactiveLogin } from './browser.js';
import { storageStateExists } from './config.js';
import { listAccountItems } from './list.js';
import { createPrompt } from './prompt.js';
import { refreshItem } from './refresh.js';
import { getUserIdFromStorageState } from './session.js';

function formatItemLine(index, item) {
  const price = item.price ? `${item.price} ${item.currency}` : '?';
  const flags = [
    item.isHidden ? 'hidden' : null,
    item.isReserved ? 'reserved' : null,
    item.isSold ? 'sold' : null,
    item.isClosed ? 'closed' : null,
  ].filter(Boolean);
  const suffix = flags.length ? ` [${flags.join(', ')}]` : '';
  return `${String(index + 1).padStart(2, ' ')}. ${item.id}  ${price.padEnd(10)}  ${item.title}${suffix}`;
}

function printSessionStatus() {
  if (!storageStateExists()) {
    console.log('Session: not logged in — choose Login first.');
    return;
  }

  const userId = getUserIdFromStorageState();
  console.log(userId ? `Session: ok (user ${userId})` : 'Session: saved, but user id missing — try Login again.');
}

async function runRefresh(baseUrl, itemUrl, options, prompt) {
  console.log(`\nRefreshing ${itemUrl}...\n`);

  const result = await refreshItem(itemUrl, options);

  if (result.dryRun) {
    console.log('\nDry run complete — no listing created.');
    return;
  }

  console.log('\nDone.');
  console.log(`  old: ${result.oldUrl}${result.hidden ? ' (hidden)' : ''}`);
  console.log(`  new: ${result.newUrl}`);
}

async function pickRefreshOptions(prompt) {
  const choice = await prompt.choose('Refresh how?', [
    { label: 'Refresh and hide old listing', value: { dryRun: false, keepOld: false } },
    { label: 'Dry run (extract only)', value: { dryRun: true, keepOld: false } },
    { label: 'Refresh but keep old listing visible', value: { dryRun: false, keepOld: true } },
    { label: 'Back', value: null },
  ]);

  return choice.value;
}

async function browseListings(baseUrl, prompt) {
  let page = 1;
  const perPage = 15;

  while (true) {
    console.log(`\nFetching listings (page ${page})...\n`);

    const result = await listAccountItems(baseUrl, {
      page,
      perPage,
      headless: true,
    });

    const { items, pagination } = result;

    if (items.length === 0) {
      console.log('No listings on this page.');
    } else {
      for (let i = 0; i < items.length; i++) {
        console.log(formatItemLine(i, items[i]));
      }
      console.log('');
      console.log(`Page ${pagination.page}/${pagination.totalPages}`);
    }

    const choice = await prompt.choose('What next?', [
      ...(items.length
        ? [{ label: 'Refresh a listing from this page', value: 'refresh' }]
        : []),
      ...(pagination.page < pagination.totalPages
        ? [{ label: 'Next page', value: 'next' }]
        : []),
      ...(pagination.page > 1 ? [{ label: 'Previous page', value: 'prev' }] : []),
      { label: 'Back to main menu', value: 'back' },
    ]);

    if (choice.value === 'back') return;

    if (choice.value === 'next') {
      page += 1;
      continue;
    }

    if (choice.value === 'prev') {
      page -= 1;
      continue;
    }

    if (choice.value === 'refresh') {
      const answer = await prompt.ask(`Listing number (1-${items.length}): `);
      const index = Number.parseInt(answer, 10) - 1;
      if (index < 0 || index >= items.length) {
        console.log('Invalid listing number.');
        continue;
      }

      const refreshOptions = await pickRefreshOptions(prompt);
      if (!refreshOptions) continue;

      await runRefresh(baseUrl, items[index].url, refreshOptions, prompt);
      await prompt.ask('\nPress Enter to continue...');
    }
  }
}

async function refreshByUrl(baseUrl, prompt) {
  const itemUrl = await prompt.ask('Item URL: ');
  if (!itemUrl) {
    console.log('No URL entered.');
    return;
  }

  const refreshOptions = await pickRefreshOptions(prompt);
  if (!refreshOptions) return;

  await runRefresh(baseUrl, itemUrl, refreshOptions, prompt);
  await prompt.ask('\nPress Enter to continue...');
}

async function runLogin(baseUrl, prompt) {
  await interactiveLogin(baseUrl);
  await prompt.ask('\nPress Enter to continue...');
}

export async function runInteractive(options = {}) {
  const baseUrl = options.baseUrl || process.env.VINTED_BASE_URL || 'https://www.vinted.it';
  const prompt = createPrompt();

  console.log('vinted-refresh — interactive mode');
  console.log(`Base URL: ${baseUrl}`);
  printSessionStatus();

  try {
    while (true) {
      const choices = [
        ...(storageStateExists()
          ? [
              { label: 'List my listings', value: 'list' },
              { label: 'Refresh by URL', value: 'refresh-url' },
            ]
          : []),
        { label: 'Login', value: 'login' },
        { label: 'Quit', value: 'quit' },
      ];

      const choice = await prompt.choose('Main menu', choices);

      if (choice.value === 'quit') {
        console.log('Bye.');
        break;
      }

      if (choice.value === 'login') {
        await runLogin(baseUrl, prompt);
        printSessionStatus();
        continue;
      }

      if (!storageStateExists()) {
        console.log('\nNo saved session. Choose Login first.\n');
        continue;
      }

      if (choice.value === 'list') {
        await browseListings(baseUrl, prompt);
        continue;
      }

      if (choice.value === 'refresh-url') {
        await refreshByUrl(baseUrl, prompt);
      }
    }
  } finally {
    prompt.close();
  }
}
