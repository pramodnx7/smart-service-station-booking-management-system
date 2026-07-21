require('dotenv').config();

const fs = require('fs');
const { chromium } = require('playwright-core');

const baseUrl = process.env.AUDIT_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
const braveExecutablePath = 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe';
const roles = ['admin', 'customer', 'technician'];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function credentialsFor(role) {
  return {
    email: process.env[`TEST_${role.toUpperCase()}_EMAIL`],
    password: process.env[`TEST_${role.toUpperCase()}_PASSWORD`]
  };
}

function monitorPage(page, failures) {
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) failures.push(`console: ${message.text()}`);
  });
  page.on('requestfailed', (request) => failures.push(`request: ${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`));
  page.on('response', (response) => {
    if (response.status() >= 400 && response.url().startsWith(baseUrl)) {
      failures.push(`response: ${response.status()} ${response.url()}`);
    }
  });
}

async function assertResponsive(page, label) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  assert(dimensions.scrollWidth <= dimensions.clientWidth + 2, `${label} has horizontal overflow (${dimensions.scrollWidth}px > ${dimensions.clientWidth}px).`);
}

async function auditPublicPage(browser, viewport) {
  const failures = [];
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  monitorPage(page, failures);
  await page.goto(`${baseUrl}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !document.querySelector('[data-live-stat]')?.textContent.includes('Loading'));
  assert(await page.locator('.service-strip article').count() > 0, 'Landing page did not render live services.');
  assert(await page.locator('.pricing__grid article').count() > 0, 'Landing page did not render live pricing plans.');
  await assertResponsive(page, `Landing page ${viewport.width}px`);
  await page.goto(`${baseUrl}/login.html`, { waitUntil: 'networkidle' });
  await assertResponsive(page, `Login page ${viewport.width}px`);
  await context.close();
  assert(!failures.length, `Public browser failures: ${failures.join(' | ')}`);
}

async function auditRole(browser, role) {
  console.log(`Auditing ${role} dashboard...`);
  const credentials = credentialsFor(role);
  assert(credentials.email && credentials.password, `Missing TEST_${role.toUpperCase()}_EMAIL/PASSWORD.`);
  const failures = [];
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  monitorPage(page, failures);
  await page.goto(`${baseUrl}/login.html?role=${role}`, { waitUntil: 'networkidle' });
  await page.fill('#email', credentials.email);
  await page.fill('#password', credentials.password);
  await Promise.all([
    page.waitForURL(`**/${role}-dashboard.html`, { timeout: 30000 }),
    page.click('#login-submit')
  ]);
  await page.waitForFunction(() => document.querySelector('[data-view-panel]') && document.body.innerText.length > 100, null, { timeout: 30000 });
  await page.waitForTimeout(500);
  await assertResponsive(page, `${role} dashboard`);

  const navigationItems = page.locator('[data-view]');
  for (let index = 0; index < await navigationItems.count(); index += 1) {
    const item = navigationItems.nth(index);
    if (await item.isVisible()) {
      await item.click();
      await page.waitForTimeout(25);
    }
  }

  assert(await page.locator('body').innerText().then((text) => text.trim().length > 100), `${role} dashboard rendered no meaningful content.`);
  await context.close();
  assert(!failures.length, `${role} browser failures: ${failures.join(' | ')}`);
}

async function main() {
  assert(fs.existsSync(braveExecutablePath), `Brave browser was not found at ${braveExecutablePath}`);
  const browser = await chromium.launch({ executablePath: braveExecutablePath, headless: true });
  try {
    await auditPublicPage(browser, { width: 1440, height: 1000 });
    await auditPublicPage(browser, { width: 390, height: 844 });
    for (const role of roles) await auditRole(browser, role);
    console.log('Browser audit passed: public desktop/mobile pages and all role dashboards.');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`Browser audit failed: ${error.message}`);
  process.exitCode = 1;
});
