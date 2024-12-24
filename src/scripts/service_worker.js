const MAX_CURRENCIES = 15;
let cache = { USD: 1, KYD: 0.83 };
let globalTimer = null;
let timeout = false;

function round(value, decimal) {
    return Math.round(value * Math.pow(10, decimal)) / Math.pow(10, decimal);
}

async function fetchWithTimeout(resource, options = {}, timeout = 10000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(resource, {
        ...options,
        signal: controller.signal
    });
    clearTimeout(id);
    return response;
}

async function refreshRate() {
    try {
        // Fetch fiat currencies
        const fiatResponse = await fetchWithTimeout(`http://outisnemo.com/minimal-currency-converter/?${Math.random() * 1000}`);
        if (fiatResponse.ok) {
            const fiatData = await fiatResponse.json();
            for (const code in fiatData.rates) {
                cache[code] = fiatData.rates[code];
            }
        }

        // Fetch crypto currencies
        const cryptoResponse = await fetchWithTimeout('https://blockchain.info/tobtc?currency=EUR&value=1');
        if (cryptoResponse.ok) {
            const btcRate = await cryptoResponse.text();
            cache['BTC'] = parseFloat(btcRate);
        }
    } catch (err) {
        console.error('Error refreshing rates:', err);
        timeout = true;
    }
}

function convertValue(value, from, to, callback) {
    if (timeout) {refreshRate();}

    globalTimer = setTimeout(() => {
        callback({ status: "error" });
    }, 10000);
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
                    if (i === 0) {currencies.push("EUR");}
                    else if (i === 1) {currencies.push("USD");}
                    else {break;}
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "convertValue") {
        const { value, from, to } = message;
        convertValue(value, from, to, (result) => {
            sendResponse(result);
        });
        return true;
    }
});
