const MAX_CURRENCIES = 15;
const FETCH_TIMEOUT_MS = 30000;
let CONVERT_TIMEOUT_MS = 10000;

let cache = { USD: 1, KYD: 0.83 };
let globalTimer = null;
let timeout = false;

function round(value, decimal) {
  return Math.round(value * Math.pow(10, decimal)) / Math.pow(10, decimal);
}

async function fetchWithTimeout(resource, options = {}, fetchTimeout = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), fetchTimeout);
  const response = await fetch(resource, {
    ...options,
    signal: controller.signal,
  });
  clearTimeout(id);
  return response;
}

async function refreshRate() {
  try {
    // fiat currencies
    const fiatResponse = await fetchWithTimeout(
      "https://raw.githubusercontent.com/OutisNemo/minimal-currency-converter/refs/heads/develop/data/rates.json"
    );
    if (fiatResponse.ok) {
      const fiatData = await fiatResponse.json();
      for (const code in fiatData.rates) {
        cache[code] = fiatData.rates[code];
      }
    }

    // top-5 crypto prices from CoinGecko
    const SYMBOL_MAP = {
      bitcoin: "BTC",
      ethereum: "ETH",
      tether: "USDT",
      ripple: "XRP",
      binancecoin: "BNB",
    };

    const idsParam = Object.keys(SYMBOL_MAP).join(",");
    const cgUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${idsParam}&vs_currencies=EUR`;

    const cryptoResponse = await fetchWithTimeout(cgUrl);
    if (cryptoResponse.ok) {
      const cryptoData = await cryptoResponse.json();

      for (const [id, data] of Object.entries(cryptoData)) {
        const ticker = SYMBOL_MAP[id]
        cache[ticker] = 1 / data.eur;
      }
    }

    timeout = false;
  } catch (err) {
    console.error("Error refreshing rates:", err);
    timeout = true;
  }
}

function convertValue(value, from, to, callback) {
  if (timeout) {
    refreshRate();
  }

  globalTimer = setTimeout(() => {
    callback({ status: "error" });
  }, CONVERT_TIMEOUT_MS);
  convertValueRecursive(value, from, to, callback);
}

function convertValueRecursive(value, from, to, callback) {
  const fromRate = cache[from];
  const toRate = cache[to];

  if (fromRate === undefined || toRate === undefined) {
    setTimeout(() => {
      convertValueRecursive(value, from, to, callback);
    }, 500);
    return;
  }

  clearTimeout(globalTimer);
  const converted = round((value / fromRate) * toRate, 6);
  callback({ status: "success", value: converted });
}

function getVersion() {
  const details = chrome.runtime.getManifest();
  return details.version;
}

async function manageVersion() {
  const currVersion = getVersion();
  const prevVersion = await getFromStorage("version");

  if (currVersion !== prevVersion) {
    if (prevVersion !== null) {
      const currencies = [];
      for (let i = 0; i < MAX_CURRENCIES; i++) {
        const currency = await getFromStorage(`currency${i}`);
        if (currency === undefined) {
          if (i === 0) {
            currencies.push("EUR");
          } else if (i === 1) {
            currencies.push("USD");
          } else {
            break;
          }
        } else {
          currencies.push(currency);
        }
      }
      await setToStorage({ currencies: JSON.stringify(currencies) });
    }
    await setToStorage({ version: currVersion });
  }
}

async function getFromStorage(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      resolve(result[key]);
    });
  });
}

async function setToStorage(data) {
  return new Promise((resolve) => {
    chrome.storage.local.set(data, resolve);
  });
}

refreshRate();
setInterval(refreshRate, 15 * 60 * 1000);

manageVersion();

// Test-only helpers — function declarations are used so sw.evaluate() can reach them.
/* eslint-disable no-unused-vars */
function _testGetCache() { return JSON.parse(JSON.stringify(cache)); }
function _testGetTimeoutFlag() { return timeout; }
function _testSeedCache(rates) { Object.assign(cache, rates); timeout = false; }
function _testClearCache() { for (const k in cache) { delete cache[k]; } timeout = false; }
function _testSetConvertTimeoutMs(ms) { CONVERT_TIMEOUT_MS = ms; }
function _testCallRefreshRate() { return refreshRate(); }
/* eslint-enable no-unused-vars */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "convertValue") {
    const { value, from, to } = message;
    convertValue(value, from, to, (result) => {
      sendResponse(result);
    });
    return true;
  }
});
