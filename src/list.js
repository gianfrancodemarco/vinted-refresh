import { withAuthenticatedContext } from './browser.js';
import { getUserIdFromStorageState } from './session.js';

async function fetchWardrobePage(page, userId, pageNum, perPage) {
  return page.evaluate(
    async ({ uid, pageNum, perPage }) => {
      const url = `/api/v2/wardrobe/${uid}/items?page=${pageNum}&per_page=${perPage}&order=relevance`;
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) return { error: response.status };
      return response.json();
    },
    { uid: userId, pageNum, perPage }
  );
}

function filterItems(items, options) {
  return items.filter((item) => {
    if (!options.includeHidden && item.is_hidden) return false;
    if (!options.includeSold) {
      if (item.is_closed) return false;
      if (item.item_closing_action === 'sold') return false;
    }
    return true;
  });
}

function normalizeItem(item, baseUrl) {
  const path = item.path || `/items/${item.id}`;
  return {
    id: String(item.id),
    title: item.title || '',
    price: item.price?.amount || '',
    currency: item.price?.currency_code || item.currency || 'EUR',
    brand: item.brand || '',
    size: item.size || '',
    url: item.url || `${baseUrl}${path}`,
    isHidden: Boolean(item.is_hidden),
    isClosed: Boolean(item.is_closed),
    isSold: item.item_closing_action === 'sold',
    isReserved: Boolean(item.is_reserved),
  };
}

export async function listAccountItems(baseUrl, options = {}) {
  const userId = getUserIdFromStorageState();
  if (!userId) {
    throw new Error('Could not read user id from session. Run `vinted-refresh login` again.');
  }

  const perPage = Math.min(Math.max(options.perPage ?? 20, 1), 96);
  const startPage = Math.max(options.page ?? 1, 1);
  const includeHidden = options.includeHidden ?? false;
  const includeSold = options.includeSold ?? false;
  const fetchAll = options.all ?? false;

  return withAuthenticatedContext(
    baseUrl,
    async ({ page }) => {
      const items = [];
      let pageNum = startPage;
      let totalPages = 1;

      do {
        const data = await fetchWardrobePage(page, userId, pageNum, perPage);
        if (data?.error) {
          throw new Error(
            `Vinted API returned HTTP ${data.error}. Session may be expired — run \`vinted-refresh login\` again.`
          );
        }

        const batch = filterItems(data?.items || [], { includeHidden, includeSold }).map((item) =>
          normalizeItem(item, baseUrl)
        );
        items.push(...batch);

        totalPages = data?.pagination?.total_pages || (batch.length === perPage ? pageNum + 1 : pageNum);
        pageNum++;
      } while (fetchAll && pageNum <= totalPages);

      return {
        userId,
        items,
        pagination: {
          page: startPage,
          perPage,
          totalPages,
        },
      };
    },
    { headless: options.headless ?? true }
  );
}

export function printItemList(result, options = {}) {
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (result.items.length === 0) {
    console.log('No listings found.');
    return;
  }

  console.log(`${result.items.length} listing(s)\n`);
  for (const item of result.items) {
    const flags = [
      item.isHidden ? 'hidden' : null,
      item.isReserved ? 'reserved' : null,
      item.isSold ? 'sold' : null,
      item.isClosed ? 'closed' : null,
    ].filter(Boolean);
    const meta = [item.brand, item.size, flags.length ? `[${flags.join(', ')}]` : null]
      .filter(Boolean)
      .join(' · ');
    const price = item.price ? `${item.price} ${item.currency}` : '?';

    console.log(`${item.id}  ${price}  ${item.title}`);
    if (meta) console.log(`  ${meta}`);
    console.log(`  ${item.url}`);
    console.log('');
  }

  if (result.pagination.totalPages > 1 && !options.all) {
    console.log(
      `Page ${result.pagination.page}/${result.pagination.totalPages} — use --page or --all to see more`
    );
  }
}
