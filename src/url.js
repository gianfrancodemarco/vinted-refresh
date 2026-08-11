const ITEM_PATH_RE = /\/items\/(\d+)/;

export function parseItemUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }

  const host = url.hostname.toLowerCase();
  if (!host.includes('vinted.')) {
    throw new Error(`Not a Vinted URL: ${rawUrl}`);
  }

  const match = url.pathname.match(ITEM_PATH_RE);
  if (!match) {
    throw new Error(`Could not parse item id from URL: ${rawUrl}`);
  }

  return {
    itemId: match[1],
    baseUrl: `${url.protocol}//${url.host}`,
    itemUrl: `${url.protocol}//${url.host}${url.pathname.split('?')[0]}`,
    pathname: url.pathname,
  };
}
