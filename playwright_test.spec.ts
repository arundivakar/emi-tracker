import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test('navigate and take screenshot of expanded amortization schedule', async ({ page }) => {
  // Set viewport to 375px width, height e.g. 800px
  await page.setViewportSize({ width: 375, height: 800 });

  // Navigate to http://localhost:5173
  await page.goto('http://localhost:5173');

  // Wait for the app to load (wait for the loader to disappear or header to appear)
  // The loader has span 'Initializing Offline SQLite Engine...'
  // Let's wait for '.app-container' or '.hdr-title' to be visible.
  console.log('Navigated to localhost:5173, waiting for app to initialize...');
  await page.waitForSelector('.hdr-title', { timeout: 15000 });
  console.log('App initialized.');

  // Check if "Test Business Loan" is visible in the list
  const loanSelector = page.locator('.loan-card-new', { has: page.locator('.lcn-name', { hasText: 'Test Business Loan' }) });
  const count = await loanSelector.count();

  if (count === 0) {
    console.log('"Test Business Loan" not found. Creating a new one...');
    
    // Click the Floating Action Button (FAB) to add a new loan
    const fabButton = page.locator('.fab-add');
    await fabButton.click();

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
  } else {
    console.log('"Test Business Loan" found in list. Clicking View Details...');
    // Click the 'View Details' button inside the existing card
    const viewDetailsButton = loanSelector.locator('.btn-view-det');
    await viewDetailsButton.click();
  }

  // Wait for the Loan Details page to load
  await page.waitForSelector('.ld-header-title', { timeout: 10000 });
  console.log('Loan details page loaded.');

  // Wait for the EMI list to load
  await page.waitForSelector('.emi-list', { timeout: 10000 });
  console.log('EMI schedule list loaded.');

  // Expand EMI #1
  // We locate the emi-row that contains '#1' inside '.emi-num'
  const emiRow = page.locator('.emi-row-wrap', { has: page.locator('.emi-num', { hasText: '#1' }) }).locator('.emi-row');
  await emiRow.click();
  console.log('Clicked EMI #1 to expand.');

  // Wait for the expanded section to become visible
  await page.waitForSelector('.emi-expand', { timeout: 5000 });
  console.log('EMI #1 expanded section is visible.');

  // Let's add a small delay to allow animations to complete
  await page.waitForTimeout(500);

  // Take screenshot and save to the specified path
  const screenshotPath = '/home/arun/.gemini/antigravity/brain/ef5cb532-6ce9-4892-b463-7466900e0bd2/expanded_amortization_schedule_optimized.png';
  
  // Make sure the parent directory exists
  const dir = path.dirname(screenshotPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  await page.screenshot({ path: screenshotPath });
  console.log('Screenshot successfully saved to:', screenshotPath);
});
