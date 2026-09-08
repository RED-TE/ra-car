const { chromium } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const dir = path.resolve('artifacts/a1auto-ui', process.argv[2] || 'implementation');
  await fs.mkdir(dir, { recursive: true });
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const width of [360, 390, 768, 1280, 1440, 1920]) {
      const page = await browser.newPage({ viewport: { width, height: width < 600 ? 844 : 1000 }, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/v1/friends/track**', route => route.fulfill({ status: 204 }));
      await page.goto('http://127.0.0.1:5188/', { waitUntil: 'networkidle' });
      await page.locator('.vehicle-grid[aria-busy="false"]').waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: path.join(dir, `${width}-first.png`) });
      const boxes = {};
      for (const id of ['home', 'special', 'ready', 'compare', 'benefits', 'faq', 'quote']) {
        const section = page.locator(`#${id}`);
        await section.evaluate(el => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
        await page.waitForTimeout(150);
        boxes[id] = await section.boundingBox();
        if ([390, 1440].includes(width)) await page.screenshot({ path: path.join(dir, `${width}-${id}.png`) });
      }
      await page.locator('.site-footer').evaluate(el => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
      if ([390, 1440].includes(width)) await page.screenshot({ path: path.join(dir, `${width}-footer.png`) });
      await page.screenshot({ path: path.join(dir, `${width}-full.png`), fullPage: true });
      results.push(await page.evaluate(({width,errors,boxes}) => ({ width, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, errors, boxes,
        brokenImages: [...document.images].filter(img => img.getBoundingClientRect().width && img.complete && !img.naturalWidth).map(img => img.getAttribute('src')),
      }), {width,errors,boxes}));
      await page.close();
    }
    await fs.writeFile(path.join(dir, 'layout-results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results.map(({boxes,...result}) => result), null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
