const { test, expect } = require('./fixtures');

async function convert(sw, value, from, to) {
  return sw.evaluate(
    ({ value, from, to }) =>
      new Promise((resolve) => convertValue(value, from, to, resolve)),
    { value, from, to }
  );
}

test.describe('Service worker — conversion math', () => {
  test('EUR → USD (1 EUR = 1.1 USD)', async ({ serviceWorker }) => {
    const result = await convert(serviceWorker, 1, 'EUR', 'USD');
    expect(result.status).toBe('success');
    expect(result.value).toBeCloseTo(1.1, 5);
  });

  test('USD → EUR (1.1 USD = 1 EUR)', async ({ serviceWorker }) => {
    const result = await convert(serviceWorker, 1.1, 'USD', 'EUR');
    expect(result.status).toBe('success');
    expect(result.value).toBeCloseTo(1, 5);
  });

  test('EUR → JPY (100 EUR = 16 000 JPY)', async ({ serviceWorker }) => {
    const result = await convert(serviceWorker, 100, 'EUR', 'JPY');
    expect(result.status).toBe('success');
    expect(result.value).toBeCloseTo(16000, 2);
  });

  test('fiat → crypto (1 EUR → BTC, price = 50 000 EUR/BTC)', async ({ serviceWorker }) => {
    const result = await convert(serviceWorker, 1, 'EUR', 'BTC');
    expect(result.status).toBe('success');
    expect(result.value).toBeCloseTo(0.00002, 8);
  });

  test('crypto → fiat (1 BTC → USD)', async ({ serviceWorker }) => {
    const result = await convert(serviceWorker, 1, 'BTC', 'USD');
    expect(result.status).toBe('success');
    expect(result.value).toBeCloseTo(55000, 2);
  });

  test('crypto → crypto (1 BTC → ETH)', async ({ serviceWorker }) => {
    const result = await convert(serviceWorker, 1, 'BTC', 'ETH');
    expect(result.status).toBe('success');
    expect(result.value).toBeCloseTo(25, 4);
  });

  test('same-currency conversion returns the same value', async ({ serviceWorker }) => {
    const result = await convert(serviceWorker, 42, 'EUR', 'EUR');
    expect(result.status).toBe('success');
    expect(result.value).toBe(42);
  });

  test('zero value converts to zero', async ({ serviceWorker }) => {
    const result = await convert(serviceWorker, 0, 'EUR', 'USD');
    expect(result.status).toBe('success');
    expect(result.value).toBe(0);
  });
});
