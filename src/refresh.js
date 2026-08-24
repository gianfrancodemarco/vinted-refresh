import fs from 'node:fs';
import { makeTempDir, withAuthenticatedContext } from './browser.js';
import { downloadImages, extractItemFields } from './extract.js';
import { hideListing } from './hide.js';
import { publishListing } from './publish.js';
import { parseItemUrl } from './url.js';

export async function refreshItem(rawUrl, options = {}) {
  const { itemId, baseUrl, itemUrl } = parseItemUrl(rawUrl);
  const dryRun = options.dryRun ?? false;
  const keepOld = options.keepOld ?? false;
  const headless = options.headless ?? false;

  console.log(`Item ${itemId} on ${baseUrl}`);

  return withAuthenticatedContext(
    baseUrl,
    async ({ page }) => {
      console.log('Reading listing fields...');
      const fields = await extractItemFields(page, itemUrl);
      console.log(`  title: ${fields.title}`);
      console.log(`  price: ${fields.price}`);
      console.log(`  category: ${fields.category || '(empty)'}`);
      if (fields.categoryPath) console.log(`  category path: ${fields.categoryPath}`);
      console.log(`  brand: ${fields.brand || '(empty)'}`);
      console.log(`  platform: ${fields.videoGamePlatform || '(empty)'}`);
      console.log(`  rating: ${fields.videoGameRating || '(empty)'}`);
      console.log(`  isbn: ${fields.isbn || '(empty)'}`);
      if (fields.bookTitle) console.log(`  book title: ${fields.bookTitle}`);
      if (fields.bookLanguage) console.log(`  book language: ${fields.bookLanguage}`);
      console.log(`  size: ${fields.size || '(empty)'}`);
      console.log(`  color: ${fields.color || '(empty)'}`);
      console.log(`  condition: ${fields.condition || '(empty)'}`);
      console.log(`  condition id: ${fields.conditionTestId || '(empty)'}`);
      console.log(`  package size id: ${fields.packageSizeId || '(empty)'}`);
      console.log(`  photos: ${fields.photoUrls.length}`);

      const tempDir = makeTempDir();
      try {
        console.log('Downloading photos...');
        const imagePaths = await downloadImages(fields.photoUrls, tempDir);
        console.log(`  saved ${imagePaths.length} file(s) to ${tempDir}`);

        if (dryRun) {
          console.log('Dry run complete — no listing created.');
          return {
            itemId,
            baseUrl,
            fields,
            imagePaths,
            dryRun: true,
          };
        }

        const newListingUrl = await publishListing(page, baseUrl, fields, imagePaths, (msg) => {
          console.log(msg);
        });
        console.log(`Published: ${newListingUrl}`);

        if (!keepOld) {
          console.log(`Hiding old listing ${itemId}...`);
          await hideListing(page, itemUrl, itemId);
          console.log(`Old listing hidden: ${itemUrl}`);
        } else {
          console.log('Skipped hiding old listing (--keep-old).');
        }

        return {
          itemId,
          baseUrl,
          oldUrl: itemUrl,
          newUrl: newListingUrl,
          hidden: !keepOld,
        };
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    },
    { headless }
  );
}
