const { resilienceTest: test, expect, FIXTURE_CACHE, FIXTURE_FIAT_RESPONSE, FIAT_URL, CRYPTO_URL } = require('./fixtures');

async function convert(sw, value, from, to) {
  return sw.evaluate(
    ({ value, from, to }) =>
      new Promise((resolve) => convertValue(value, from, to, resolve)),
    { value, from, to }
  );
}

async function resetCache(sw) {
  await sw.evaluate(() => _testClearCache());
}

test.describe('Network errors', () => {
  test('both APIs abort → timeout flag set, conversion returns error', async ({ ctx: { context, sw } }) => {
    await resetCache(sw);

    await context.route(FIAT_URL, (route) => route.abort('failed'));
    await context.route(CRYPTO_URL, (route) => route.abort('failed'));

    await sw.evaluate(() => _testCallRefreshRate());

    expect(await sw.evaluate(() => _testGetTimeoutFlag())).toBe(true);
    const result = await convert(sw, 1, 'EUR', 'USD');
    expect(result.status).toBe('error');
  });
});

test.describe('Fiat API — bad responses', () => {
  test('malformed JSON → timeout flag set', async ({ ctx: { context, sw } }) => {
    await resetCache(sw);

    await context.route(FIAT_URL, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '<!doctype html><html>not json</html>' })
    );

    await sw.evaluate(() => _testCallRefreshRate());

    const timedOut = await sw.evaluate(() => _testGetTimeoutFlag());
    expect(timedOut).toBe(true);
  });

  test('valid JSON but missing "rates" key → no crash, cache unchanged', async ({ ctx: { context, sw } }) => {
    await sw.evaluate(() => { _testSeedCache({ EUR: 1 }); });

    await context.route(FIAT_URL, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ base: 'EUR' }) })
    );

    await sw.evaluate(() => _testCallRefreshRate());

    expect(await sw.evaluate(() => _testGetCache().EUR)).toBe(1);
    expect(await sw.evaluate(() => _testGetTimeoutFlag())).toBe(false);
  });

  test('specific currency missing from rates → its conversion times out', async ({ ctx: { context, sw } }) => {
    await resetCache(sw);

    await context.route(FIAT_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ rates: { EUR: 1, GBP: 0.86 } }),
      })
    );
    await sw.evaluate(() => _testCallRefreshRate());

    const ok = await convert(sw, 1, 'EUR', 'GBP');
    expect(ok.status).toBe('success');
    expect(ok.value).toBeCloseTo(0.86, 4);

    const fail = await convert(sw, 1, 'EUR', 'USD');
    expect(fail.status).toBe('error');
  });

  test('non-numeric rate value → conversion produces NaN without crash', async ({ ctx: { context, sw } }) => {
    await resetCache(sw);

    await context.route(FIAT_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ rates: { EUR: 1, USD: 'abc' } }),
      })
    );

    await sw.evaluate(() => _testCallRefreshRate());

    const result = await convert(sw, 1, 'EUR', 'USD');
    expect(result.status).toBe('success');
    expect(result.value).toBeNaN();
  });
});

test.describe('Crypto API — bad responses', () => {
  test('429 rate-limited → crypto times out, fiat conversions still work', async ({ ctx: { context, sw } }) => {
    await resetCache(sw);

    await context.route(FIAT_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(FIXTURE_FIAT_RESPONSE),
      })
    );
    await context.route(CRYPTO_URL, (route) =>
      route.fulfill({ status: 429, body: '{"error":"rate limit exceeded"}' })
    );

    await sw.evaluate(() => _testCallRefreshRate());

    const fiat = await convert(sw, 1, 'EUR', 'USD');
    expect(fiat.status).toBe('success');
    expect(fiat.value).toBeCloseTo(1.1, 5);

    const crypto = await convert(sw, 1, 'EUR', 'BTC');
    expect(crypto.status).toBe('error');
  });

  test('200 OK but unexpected shape (no eur key) → no crash, fiat still works', async ({ ctx: { context, sw } }) => {
    await resetCache(sw);

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
        body: JSON.stringify({ bitcoin: { usd: 55000 }, ethereum: { usd: 2200 } }),
      })
    );

    await sw.evaluate(() => _testCallRefreshRate());

    const fiat = await convert(sw, 1, 'EUR', 'USD');
    expect(fiat.status).toBe('success');
  });

  test('200 OK but HTML body → JSON parse error caught, fiat still works', async ({ ctx: { context, sw } }) => {
    await resetCache(sw);

    await context.route(FIAT_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(FIXTURE_FIAT_RESPONSE),
      })
    );
    await context.route(CRYPTO_URL, (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<html>Service Unavailable</html>' })
    );

    await sw.evaluate(() => _testCallRefreshRate());

    // Fiat was applied before the crypto JSON parse error; catch sets timeout=true.
    const cacheKeys = await sw.evaluate(() => Object.keys(_testGetCache()));
    expect(cacheKeys).toContain('EUR');
    expect(cacheKeys).toContain('USD');
    expect(await sw.evaluate(() => _testGetTimeoutFlag())).toBe(true);
  });
});

test.describe('Recovery', () => {
  test('conversion succeeds after retry once healthy routes are restored', async ({ ctx: { context, sw } }) => {
    await resetCache(sw);
    await context.route(FIAT_URL, (route) => route.abort('failed'));
    await context.route(CRYPTO_URL, (route) => route.abort('failed'));
    await sw.evaluate(() => _testCallRefreshRate());

    expect(await sw.evaluate(() => _testGetTimeoutFlag())).toBe(true);

    await context.unroute(FIAT_URL);
    await context.unroute(CRYPTO_URL);

    await sw.evaluate((rates) => { _testSeedCache(rates); }, FIXTURE_CACHE);

    const result = await convert(sw, 1, 'EUR', 'USD');
    expect(result.status).toBe('success');
    expect(result.value).toBeCloseTo(1.1, 5);
  });
});
