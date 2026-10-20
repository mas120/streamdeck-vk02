import playwright from 'playwright';

const browser = await playwright.chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();

// Listen to console
page.on('console', msg => console.log('BROWSER:', msg.text()));
page.on('pageerror', err => console.error('ERROR:', err.message));

console.log('Opening http://localhost:1420...');
await page.goto('http://localhost:1420', { waitUntil: 'networkidle' });

console.log('Waiting for JS execution...');
await page.waitForTimeout(3000);

const debug = await page.evaluate(() => {
  return {
    gridStackType: typeof GridStack,
    gridType: typeof grid,
    gridNodes: typeof grid !== 'undefined' && grid ? grid.engine.nodes.length : 0,
    domItems: document.querySelectorAll('.grid-stack-item').length,
    gridHTML: document.querySelector('.grid-stack')?.innerHTML.substring(0, 200),
    localStorage: localStorage.getItem('STREAMDECK_VK02_LAYOUT'),
    bodyClasses: document.body.className,
    errors: window.__errors || []
  };
});

console.log('\n=== DEBUG RESULTS ===');
console.log(JSON.stringify(debug, null, 2));

await page.screenshot({ path: 'debug_screenshot.png', fullPage: true });
console.log('\nScreenshot: debug_screenshot.png');

await browser.close();
