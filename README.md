# vinted-refresh

Re-upload a Vinted listing from a single URL and hide the original. Useful when you want a listing to appear as new again without retyping everything.

Built with **Node.js + Playwright**. Session is saved to a config file so you log in once and reuse it across runs.

## Requirements

- Node.js 18+
- A Vinted account you own the listing on

## Install

```bash
git clone <repo-url> vinted-refresh
cd vinted-refresh
npm install
```

`npm install` also downloads Playwright's Chromium browser.

Optional — install the CLI globally:

```bash
npm link
```

## Quick start

### 1. Log in once

```bash
vinted-refresh login --url https://www.vinted.it
```

Opens **Chrome directly** (not via Playwright automation) so Google/Apple sign-in works. Session is stored in `~/.config/vinted-refresh/session-profile/` — log in once, press Enter.

Your session file is saved to:

- **macOS / Linux:** `~/.config/vinted-refresh/storageState.json`
- **Windows:** `%APPDATA%/vinted-refresh/storageState.json`

### 2. Refresh a listing

```bash
vinted-refresh refresh "https://www.vinted.it/items/123456789-your-item-slug"
```

The tool will:

1. Read the listing from the edit form (title, description, price, photos, etc.)
2. Download the photos
3. Publish a **new** listing at `/items/new`
4. **Hide** the old listing (only after publish succeeds)

## Commands

| Command | Description |
|---------|-------------|
| `vinted-refresh login [--url <base-url>]` | Save a browser session after manual login |
| `vinted-refresh refresh <item-url> [options]` | Re-upload a listing and hide the original |

### Options

| Flag | Description |
|------|-------------|
| `--url <base-url>` | Vinted domain for login (default: `https://www.vinted.it`) |
| `--dry-run` | Extract fields and download photos only — no publish |
| `--keep-old` | Publish the new copy but leave the old listing visible |
| `--headless` | Run without a visible browser (less reliable with anti-bot) |

### npm scripts

```bash
npm run login
npm run refresh -- "https://www.vinted.it/items/123456789-your-item"
```

## Environment variables

| Variable | Description |
|----------|-------------|
| `VINTED_BASE_URL` | Default base URL for `login` (e.g. `https://www.vinted.fr`) |
| `VINTED_REFRESH_CONFIG` | Override config directory (where `storageState.json` is stored) |

## Examples

```bash
# Log in on vinted.fr
VINTED_BASE_URL=https://www.vinted.fr vinted-refresh login

# Preview what would be extracted
vinted-refresh refresh "https://www.vinted.it/items/123456789-item" --dry-run

# Publish new copy without hiding the old one
vinted-refresh refresh "https://www.vinted.it/items/123456789-item" --keep-old
```

## How it works

```
item URL
  → open edit form and scrape fields + photo URLs
  → download photos to a temp directory
  → fill /items/new and publish
  → hide the old listing via the UI
```

The domain is taken from the URL you pass in (`.it`, `.fr`, `.de`, etc.) — no hardcoded locale.

**Create first, hide second.** If publishing fails, the old listing stays live.

## Portability

- Uses installed **Chrome or Edge**, not bundled Chromium
- Session lives in `~/.config/vinted-refresh/` (portable, copyable)
- Works on macOS, Linux, and Windows

## Caveats

- **Unofficial.** Vinted has no public API for this. The tool automates the web UI and may break when Vinted updates their site.
- **Your listings only.** You must be logged in as the owner; the edit button won't appear otherwise.
- **New listing = new URL.** Favorites, views, and messages stay on the old (hidden) listing.
- **Anti-bot.** Run with a visible browser (default). `--headless` is more likely to fail.
- **Hide is best-effort.** If the hide button isn't found (UI varies by locale), the new listing is still created — you'll need to hide the old one manually.
- **Terms of service.** Use at your own risk, only on listings you control.

## Project structure

```
bin/vinted-refresh.js   CLI entry point
src/
  browser.js            Playwright launch + session management
  config.js             Config directory paths
  extract.js            Read listing fields + download photos
  publish.js            Fill upload form and submit
  hide.js               Hide old listing via UI
  refresh.js            Orchestrates the full flow
  url.js                Parse item ID and domain from URL
```

## License

Use responsibly. Not affiliated with Vinted.
