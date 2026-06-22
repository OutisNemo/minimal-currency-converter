const { test, expect } = require('./fixtures');

// fill() sets the value without triggering keyup; dispatchEvent fires the
// popup's onValueChange → debouncedUpdate handler that listens on keyup.
async function typeIntoInput(page, selector, value) {
  const locator = page.locator(selector);
  await locator.fill(value);
  await locator.dispatchEvent('keyup', { bubbles: true, cancelable: true });
}

async function waitForConversion(page, selector = '#value1') {
  await expect(page.locator(selector)).not.toHaveValue(/loading/i, { timeout: 8000 });
}

test.describe('Popup UI', () => {
  let page;

  test.beforeEach(async ({ extensionContext, extensionId, serviceWorker }) => {
    const { FIXTURE_CACHE } = require('./fixtures');
    await serviceWorker.evaluate((rates) => { _testSeedCache(rates); }, FIXTURE_CACHE);

    page = await extensionContext.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await waitForConversion(page);
  });

  test.afterEach(async () => {
    await page.close();
  });

  test('loads with EUR and USD rows by default', async () => {
    await expect(page.locator('#currency0')).toHaveValue('EUR');
    await expect(page.locator('#currency1')).toHaveValue('USD');
    await expect(page.locator('#value0')).toHaveValue('1');
    await expect(page.locator('#value1')).toHaveValue(/USD$/);
  });

  test('converts EUR → USD correctly (1 EUR = 1.1 USD)', async () => {
    await typeIntoInput(page, '#value0', '100');
    await expect(page.locator('#value1')).toHaveValue(/^110 USD$/, { timeout: 8000 });
  });

  test('converts USD → EUR correctly (110 USD = 100 EUR)', async () => {
    await typeIntoInput(page, '#value1', '110');
    await expect(page.locator('#value0')).toHaveValue(/^100 EUR$/, { timeout: 8000 });
  });

  test('add row enables Remove; adding up to 15 disables Add', async () => {
    await expect(page.locator('#btnAdd')).toBeEnabled();

    await page.locator('#btnAdd').click();
    await expect(page.locator('#trCurrency2')).toBeAttached();
    await expect(page.locator('#btnRemove')).toBeEnabled();

    for (let i = 3; i < 15; i++) {
      await page.locator('#btnAdd').click();
    }
    await expect(page.locator('#btnAdd')).toBeDisabled();
  });

  test('remove row restores Add; removing to 2 disables Remove', async () => {
    await page.locator('#btnAdd').click();
    await expect(page.locator('#btnRemove')).toBeEnabled();

    await page.locator('#btnRemove').click();
    await expect(page.locator('#trCurrency2')).not.toBeAttached();
    await expect(page.locator('#btnRemove')).toBeDisabled();
    await expect(page.locator('#btnAdd')).toBeEnabled();
  });

  test('changing currency select triggers recalculation', async () => {
    // Changing currency0 works because value0 is always numeric ("1").
    // Changing currency1 would call update() on "1.1 USD" which isNaN → no-op.
    const initialValue1 = await page.locator('#value1').inputValue();
    await page.locator('#currency0').selectOption('GBP');
    await expect(page.locator('#value1')).not.toHaveValue(initialValue1, { timeout: 8000 });
    await expect(page.locator('#value1')).toHaveValue(/USD$/, { timeout: 8000 });
  });

  test('state (selected currencies + last value) persists across reload', async () => {
    await page.locator('#currency1').selectOption('GBP');
    await typeIntoInput(page, '#value0', '50');
    // Wait for the GBP result — this confirms the debounce fired and localStorage
    // was written before we reload.
    await expect(page.locator('#value1')).toHaveValue(/GBP$/, { timeout: 8000 });

    await page.reload();
    await waitForConversion(page);

    await expect(page.locator('#currency1')).toHaveValue('GBP');
    await expect(page.locator('#value0')).toHaveValue('50');
  });
});
