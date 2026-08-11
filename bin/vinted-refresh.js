#!/usr/bin/env node

import { interactiveLogin } from '../src/browser.js';
import { storageStateExists } from '../src/config.js';
import { refreshItem } from '../src/refresh.js';

const DEFAULT_BASE_URL = process.env.VINTED_BASE_URL || 'https://www.vinted.it';

function printHelp() {
  console.log(`vinted-refresh — re-upload a Vinted listing and hide the old one

Usage:
  vinted-refresh login [--url <vinted-base-url>]
  vinted-refresh refresh <item-url> [--dry-run] [--keep-old] [--headless]

Commands:
  login     Open a browser, log in once, save session to config dir
  refresh   Read listing, publish a new copy, hide the original

Options:
  --url         Vinted base URL for login (default: ${DEFAULT_BASE_URL})
  --dry-run     Extract fields and download photos only
  --keep-old    Publish new listing but do not hide the old one
  --headless    Run browser headless (less reliable with anti-bot)

Environment:
  VINTED_BASE_URL          Default base URL for login
  VINTED_REFRESH_CONFIG    Override config directory

Examples:
  vinted-refresh login --url https://www.vinted.it
  vinted-refresh refresh "https://www.vinted.it/items/123456789-my-item"
  vinted-refresh refresh "https://www.vinted.it/items/123456789-my-item" --dry-run
`);
}

function parseArgs(argv) {
  const args = [...argv];
  const positional = [];
  const flags = new Set();
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--url') {
      options.url = args[++i];
      continue;
    }
    if (arg.startsWith('--')) {
      flags.add(arg);
      continue;
    }
    positional.push(arg);
  }

  return { positional, flags, options };
}

async function main() {
  const { positional, flags, options } = parseArgs(process.argv.slice(2));
  const command = positional[0];

  if (!command || command === '--help' || command === '-h' || flags.has('--help')) {
    printHelp();
    process.exit(command ? 0 : 1);
  }

  try {
    if (command === 'login') {
      const baseUrl = options.url || DEFAULT_BASE_URL;
      await interactiveLogin(baseUrl);
      return;
    }

    if (command === 'refresh') {
      const itemUrl = positional[1];
      if (!itemUrl) {
        console.error('Missing item URL.\n');
        printHelp();
        process.exit(1);
      }

      if (!storageStateExists()) {
        console.error('No saved session. Run `vinted-refresh login` first.\n');
        process.exit(1);
      }

      const result = await refreshItem(itemUrl, {
        dryRun: flags.has('--dry-run'),
        keepOld: flags.has('--keep-old'),
        headless: flags.has('--headless'),
      });

      if (!result.dryRun) {
        console.log('\nDone.');
        console.log(`  old: ${result.oldUrl}${result.hidden ? ' (hidden)' : ''}`);
        console.log(`  new: ${result.newUrl}`);
      }
      return;
    }

    console.error(`Unknown command: ${command}\n`);
    printHelp();
    process.exit(1);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
