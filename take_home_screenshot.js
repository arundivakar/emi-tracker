import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Set viewport to 375px width, height e.g. 800px
  await page.setViewportSize({ width: 375, height: 800 });

  console.log('Navigating to http://localhost:5173...');
  try {
    await page.goto('http://localhost:5173');
  } catch (err) {
    console.error('Failed to navigate to http://localhost:5173. Is the dev server running?', err.message);
    throw err;
  }

  console.log('Waiting for app to initialize...');
  await page.waitForSelector('.hdr-title', { timeout: 15000 });
  console.log('App initialized.');

  // Check if we have any loan cards
  const loanCards = page.locator('.loan-card-new');
  const count = await loanCards.count();

  if (count === 0) {
    console.log('No loans found. Adding a test loan...');
    
    // Check if there is an empty state button or FAB
    const emptyStateButton = page.locator('.home-empty-state button');
    if (await emptyStateButton.count() > 0) {
      await emptyStateButton.click();
    } else {
      await page.locator('.fab-add').click();
    }

    // Wait for the form to load
    await page.waitForSelector('.fintech-styled-form', { timeout: 5000 });

    // Fill the form fields
    await page.locator('input[placeholder*="iPhone 16 Pro"]').fill('Test Business Loan');
    await page.locator('input[placeholder="e.g. 150000"]').fill('50000');
    await page.locator('input[placeholder="e.g. 13.5"]').fill('10');
    await page.locator('input[placeholder="e.g. 12"]').fill('12');

    // Click "Save Loan" button
    const saveButton = page.locator('button[type="submit"]');
    await saveButton.click();

    console.log('Loan details submitted, waiting for redirect...');
    
    // Wait for the Loan Details page to load
    await page.waitForSelector('.ld-header-title', { timeout: 10000 });
    console.log('Loan details page loaded. Reloading page to go back to Home Screen...');

    // Reload page to return to Home Screen
    await page.goto('http://localhost:5173');
    
    // Wait for Home Screen to reload
    await page.waitForSelector('.loan-card-new', { timeout: 10000 });
    console.log('Returned to Home Screen.');
  } else {
    console.log(`Found ${count} existing loan(s) on Home Screen.`);
  }

  // Let's add a small delay to allow animations to complete
  await page.waitForTimeout(1000);

  // Take screenshot and save to the specified path
  const screenshotPath = '/home/arun/.gemini/antigravity/brain/8086dcbf-e2dd-4928-b710-6e4c5872d4db/redesigned_home_screen.png';
  
  // Make sure the parent directory exists
  const dir = path.dirname(screenshotPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  await page.screenshot({ path: screenshotPath });
  console.log('Screenshot successfully saved to:', screenshotPath);

  // Let's print page console errors if any occurred
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('PAGE CONSOLE ERROR:', msg.text());
    }
  });

  await browser.close();
}

run().catch(err => {
  console.error('Error during execution:', err);
  process.exit(1);
});
