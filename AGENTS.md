# Minimal Currency Converter — Agent Guidelines

A vanilla-JavaScript **Manifest V3** Chrome extension. No framework, no bundler, no build step. See [README.md](README.md) for the user-facing overview and currency list.

## Architecture

The shipped extension lives entirely in [`src/`](src/). Two scripts communicate via `chrome.runtime` messaging:

- `src/scripts/service_worker.js` — background worker. Fetches & caches exchange rates (fiat from `data/rates.json` on GitHub raw, crypto from CoinGecko), refreshes every 15 min, and answers `{ type: "convertValue" }` messages with the converted value.
- `src/scripts/popup.js` — popup UI. Builds currency rows, persists state to `localStorage`, and sends `convertValue` messages to the worker.
- `src/scripts/currencies.js` — the single source of truth for supported currencies (`window.currenciesJSON`).

`data/rates.json` is fetched at runtime from the `develop` branch on GitHub — it is **not** bundled into the extension.

## Conventions

- **Plain ES, no modules**: scripts are loaded via `<script src>` and ESLint `sourceType` is `script`. Do **not** add `import`/`export`, npm runtime deps, or a bundler.
- **Shared globals**: `MAX_CURRENCIES = 15` is duplicated in both `service_worker.js` and `popup.js` — keep them in sync.
- **Adding a currency**: update `src/scripts/currencies.js` (display) AND ensure the rate exists in `data/rates.json` (fiat) or the CoinGecko `SYMBOL_MAP` in `service_worker.js` (crypto). Update the currency list in `README.md` too.
- Lint rules enforce `no-var` and `curly` (see `eslint.config.mjs`). Prefer `const`/`let`.

## Build, lint & test

- No build step — load `src/` as an unpacked extension at `chrome://extensions` (Developer mode → Load unpacked).
- Lint: `npx eslint .`
- **Tests**: `npm test` (headless Playwright). Run both lint and tests after every code change to verify correctness.
  - `npm run test:headed` — visible browser window (useful for debugging popup tests).
  - `npm run test:ui` — Playwright UI mode with trace viewer.
  - Test files live in `tests/`; shared fixtures are in `tests/fixtures.js`.
  - Rates APIs are stubbed — tests are deterministic and require no network access.

## Gotchas

- Bumping the version requires editing **both** `src/manifest.json` and `package.json`.
- `service_worker.js` runs as an MV3 service worker (no DOM, no `window`); `popup.js`/`currencies.js` run in the popup page (have `window`/`localStorage`).
- **`_test*` helpers in `service_worker.js`** must be `function` declarations — `let`/`const` at the top level of a classic script are in script scope, not global scope, and cannot be reached via `sw.evaluate()`. Only `function` declarations are hoisted to global scope. When adding a new helper, also add it to the `globals` block in `eslint.config.mjs` for `tests/**/*.js`.
