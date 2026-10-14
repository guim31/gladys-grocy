// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Refresh intervals offered in the configuration, in seconds.
export const POLL_INTERVALS = ['30', '60', '120', '300'];

// "Due soon" window of the products, in days (Grocy's own default is 5).
export const DUE_SOON_DAYS = { min: 1, max: 30 };
// Shopping list ids: Grocy numbers its lists from 1, the default list.
export const SHOPPING_LIST_IDS = { min: 1, max: 1000 };

export const DEFAULT_CONFIG = {
  grocy_url: '',
  api_key: '',
  allow_self_signed: false,
  due_soon_days: 5,
  shopping_list_id: 1,
  poll_interval: '60',
  language: 'fr',
};

/**
 * Parse the address typed by the user into a base URL: a bare host or IP
 * (`192.0.2.10:9283`), or the URL copied from the browser
 * (`https://grocy.example.com/stockoverview`). HTTP by default. The path is
 * kept, Grocy can run in a sub-directory (`https://nas.example.com/grocy`),
 * minus a trailing `/api` and the page the browser was on.
 * @param {unknown} raw
 * @returns {string|null} `http(s)://host[:port][/path]`, null when unusable
 */
export function parseGrocyUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (!text) {
    return null;
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  // Credentials in the address would end up in the logs and the device params.
  if (url.username || url.password) {
    return null;
  }
  const path = url.pathname
    .replace(/\/+$/, '')
    // The address of a Grocy page copied from the browser: keep its base only.
    .replace(
      /\/(api|stockoverview|shoppinglist|choresoverview|batteriesoverview|tasks|stockentries|login)(\/.*)?$/i,
      '',
    );
  return `${url.origin}${path}`;
}

/** Address shown to the user (no scheme). */
export const hostOf = (url) => url.replace(/^https?:\/\//, '');

const integer = (value, { min, max }, fallback) => {
  const number =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : NaN;
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(number)));
};

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const typed = typeof source.grocy_url === 'string' ? source.grocy_url.trim() : '';
  const pick = (key, list) => {
    const value = source[key] === undefined || source[key] === null ? '' : String(source[key]);
    return list.includes(value) ? value : DEFAULT_CONFIG[key];
  };
  return {
    url: parseGrocyUrl(typed),
    // An address was typed but could not be read: said in the connection status.
    invalidUrl: typed !== '' && parseGrocyUrl(typed) === null,
    // Kept as typed but trimmed: an API key never holds spaces, a pasted one often ends with one.
    apiKey: typeof source.api_key === 'string' ? source.api_key.trim() : '',
    allowSelfSigned: source.allow_self_signed === true || source.allow_self_signed === 'true',
    dueSoonDays: integer(source.due_soon_days, DUE_SOON_DAYS, DEFAULT_CONFIG.due_soon_days),
    shoppingListId: integer(
      source.shopping_list_id,
      SHOPPING_LIST_IDS,
      DEFAULT_CONFIG.shopping_list_id,
    ),
    pollIntervalMs: Number(pick('poll_interval', POLL_INTERVALS)) * 1000,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
