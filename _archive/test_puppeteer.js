const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  
  // Listen to console logs
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err.message));
  
  await page.goto('http://localhost:1420', { waitUntil: 'networkidle2' });
  
  // Wait a bit for JS to execute
  await page.waitForTimeout(2000);
  
  // Check grid
  const debug = await page.evaluate(() => {
    const results = {
      gridStackExists: typeof GridStack !== 'undefined',
      gridExists: typeof grid !== 'undefined',
      gridNodes: typeof grid !== 'undefined' && grid ? grid.engine.nodes.length : 0,
      domItems: document.querySelectorAll('.grid-stack-item').length,
      localStorage: localStorage.getItem('STREAMDECK_VK02_LAYOUT'),
      defaultWidgets: typeof defaultWidgets !== 'undefined',
      consoleHasLogs: true
    };
    return results;
  });
  
  console.log('=== DEBUG RESULTS ===');
  console.log(JSON.stringify(debug, null, 2));
  
  // Take screenshot
  await page.screenshot({ path: 'debug_screenshot.png', fullPage: true });
  console.log('Screenshot saved: debug_screenshot.png');
  
  await browser.close();
})();
