const { test: base, chromium } = require('@playwright/test');
const path = require('path');

const PATH_TO_EXTENSION = path.join(__dirname, '..', 'src');

const FIAT_URL = 'https://raw.githubusercontent.com/OutisNemo/**';
const CRYPTO_URL = 'https://api.coingecko.com/**';

// cache[code] = units of that currency per 1 EUR (ECB convention).
const FIXTURE_CACHE = {
  EUR: 1,
  USD: 1.1,
  GBP: 0.86,
  JPY: 160,
  CHF: 0.95,
  BTC: 1 / 50000,
  ETH: 1 / 2000,
  USDT: 1 / 0.92,
  XRP: 1 / 0.5,
  BNB: 1 / 400,
};

const FIXTURE_FIAT_RESPONSE = {
  rates: { EUR: 1, USD: 1.1, GBP: 0.86, JPY: 160, CHF: 0.95 },
};

const FIXTURE_CRYPTO_RESPONSE = {
  bitcoin:     { eur: 50000 },
  ethereum:    { eur: 2000  },
  tether:      { eur: 0.92  },
  ripple:      { eur: 0.5   },
  binancecoin: { eur: 400   },
};

async function launchExtensionContext() {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    locale: 'en-US',
    args: [
      `--disable-extensions-except=${PATH_TO_EXTENSION}`,
      `--load-extension=${PATH_TO_EXTENSION}`,
    ],
  });

  await context.route(FIAT_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(FIXTURE_FIAT_RESPONSE),
    })
  );
  await context.route(CRYPTO_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(FIXTURE_CRYPTO_RESPONSE),
    })
  );

  return context;
}

async function getServiceWorker(context) {
  let [sw] = context.serviceWorkers();
  if (!sw) {
    sw = await context.waitForEvent('serviceworker');
  }
  return sw;
}

async function seedWorkerCache(sw) {
  await sw.evaluate((rates) => {
    _testSeedCache(rates);
    _testSetConvertTimeoutMs(2000);
  }, FIXTURE_CACHE);
}

const test = base.extend({
  // Named 'extensionContext' to avoid clashing with Playwright's built-in 'context' fixture.
  extensionContext: [
    async (_, use) => {
      const ctx = await launchExtensionContext();
      const sw = await getServiceWorker(ctx);
      await seedWorkerCache(sw);
      await use(ctx);
      await ctx.close();
    },
    { scope: 'worker' },
  ],

  extensionId: [
    async ({ extensionContext }, use) => {
      const [sw] = extensionContext.serviceWorkers();
      const id = sw.url().split('/')[2];
      await use(id);
    },
    { scope: 'worker' },
  ],

  serviceWorker: [
    async ({ extensionContext }, use) => {
      const [sw] = extensionContext.serviceWorkers();
      await use(sw);
    },
    { scope: 'worker' },
  ],
});

// Resilience fixture — fresh context per test for full isolation.
const resilienceTest = base.extend({
  ctx: [
    async (_, use) => {
      const context = await launchExtensionContext();
      const sw = await getServiceWorker(context);
      // EUR is absent from the initial cache, so its appearance confirms the
      // startup refreshRate() has finished before any test manipulates state.
      await sw.evaluate(() =>
        new Promise((resolve) => {
          const check = () =>
            _testGetCache().EUR !== undefined ? resolve() : setTimeout(check, 50);
          check();
        })
      );
      await sw.evaluate(() => _testSetConvertTimeoutMs(2000));
      await use({ context, sw });
      await context.close();
    },
    { scope: 'test' },
  ],
});

const { expect } = base;

module.exports = {
  test,
  resilienceTest,
  expect,
  FIXTURE_CACHE,
  FIXTURE_FIAT_RESPONSE,
  FIXTURE_CRYPTO_RESPONSE,
  FIAT_URL,
  CRYPTO_URL,
  PATH_TO_EXTENSION,
  launchExtensionContext,
  getServiceWorker,
  seedWorkerCache,
};
