// -----------------------------------------------------------------------------
// Grocy REST API client (`/api`, documented by every Grocy on `/api` with its
// OpenAPI specification, grocy.openapi.json in the grocy repository).
//
// Authentication: an API key (Grocy → user menu → "Manage API keys"), sent in
// the GROCY-API-KEY header on every request. No session, no login: a refused
// key is a 401 on any call. A Grocy running with DISABLE_AUTH ignores the key.
//
// Grocy 4.0 returns numbers as numbers; Grocy 3 returned nearly every field as
// a string. The client hands the answers over as they are: src/grocy/model.js
// reads both.
// -----------------------------------------------------------------------------

import { httpRequest } from './http.js';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: down, wrong address, firewall
  TLS: 'tls', // the certificate does not verify (self-signed without the option)
  AUTH: 'auth', // API key missing, wrong or deleted
  REDIRECT: 'redirect', // the address redirects (HTTP to HTTPS, a login page…)
  NOT_GROCY: 'not_grocy', // something answers, not the Grocy API
  HTTP: 'http', // any other HTTP error
});

export class GrocyError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS, or 'rejected' (a 400 of Grocy, see `api`)
   * @param {string} message English, for the logs (never contains the API key)
   * @param {object} [extra] { status, grocyMessage }
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'GrocyError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

// A 400 answer: Grocy refused the operation and says why ({ error_message }).
export const REJECTED = 'rejected';

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

function networkError(err) {
  if (TLS_CODES.has(err.code)) {
    return new GrocyError(ERROR_KINDS.TLS, `Certificate refused (${err.code})`);
  }
  return new GrocyError(ERROR_KINDS.UNREACHABLE, err.code ? `${err.code}` : err.message);
}

/** A redirect target fit for the logs: no user, password or query string. */
export function safeLocation(location) {
  if (typeof location !== 'string' || location === '') {
    return '?';
  }
  try {
    const url = new URL(location, 'http://relative.invalid');
    return url.host === 'relative.invalid' ? url.pathname : `${url.origin}${url.pathname}`;
  } catch {
    return '?';
  }
}

function parseJson(body) {
  if (typeof body !== 'string' || body === '') {
    return undefined;
  }
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

/** The message of a Grocy 400 answer, shortened for the logs and the toasts. */
const grocyMessage = (data) =>
  typeof data?.error_message === 'string' ? data.error_message.slice(0, 200) : '';

export class GrocyClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL, `http(s)://host[:port][/path]`
   * @param {string} [options.apiKey] '' when Grocy runs without authentication
   * @param {boolean} [options.insecure] accept a self-signed certificate
   * @param {typeof httpRequest} [options.request] test seam
   * @param {number} [options.timeoutMs]
   */
  constructor({ url, apiKey = '', insecure = false, request = httpRequest, timeoutMs = 15_000 }) {
    this.url = url;
    this.apiKey = apiKey;
    this.insecure = insecure;
    this.request = request;
    this.timeoutMs = timeoutMs;
  }

  /**
   * One API call.
   * @param {string} method
   * @param {string} path below /api, e.g. `/stock/volatile`
   * @param {object} [options]
   * @param {Record<string, string|number>} [options.query]
   * @param {unknown} [options.json] body
   * @returns {Promise<unknown>} the parsed answer, null for a 204
   */
  async api(method, path, { query, json } = {}) {
    const search = query ? `?${new URLSearchParams(query)}` : '';
    let response;
    try {
      response = await this.request(`${this.url}/api${path}${search}`, {
        method,
        json,
        headers: this.apiKey ? { 'GROCY-API-KEY': this.apiKey } : {},
        insecure: this.insecure,
        timeoutMs: this.timeoutMs,
      });
    } catch (err) {
      throw networkError(err);
    }
    const { status } = response;
    if (status >= 300 && status < 400) {
      throw new GrocyError(
        ERROR_KINDS.REDIRECT,
        `Redirected to ${safeLocation(response.headers?.location)}`,
        { status },
      );
    }
    if (status === 401) {
      throw new GrocyError(ERROR_KINDS.AUTH, 'API key refused', { status });
    }
    const data = parseJson(response.body);
    if (status === 204) {
      return null;
    }
    if (status === 400 && data && typeof data === 'object') {
      const message = grocyMessage(data);
      throw new GrocyError(REJECTED, `Grocy refused ${method} ${path}: ${message}`, {
        status,
        grocyMessage: message,
      });
    }
    if (status === 404 || (status === 200 && (data === undefined || data === null))) {
      // A web page, another application, or a Grocy below the address typed.
      throw new GrocyError(ERROR_KINDS.NOT_GROCY, `No Grocy API at /api${path} (HTTP ${status})`, {
        status,
      });
    }
    if (status !== 200) {
      throw new GrocyError(ERROR_KINDS.HTTP, `${method} /api${path} failed with HTTP ${status}`, {
        status,
      });
    }
    return data;
  }

  // --- Reading -----------------------------------------------------------------

  getSystemInfo() {
    return this.api('GET', '/system/info');
  }

  /** The server clock: its UTC offset tells the local time Grocy compares dates in. */
  getSystemTime() {
    return this.api('GET', '/system/time');
  }

  /** When the database last changed: one small request tells whether to read everything. */
  getDbChangedTime() {
    return this.api('GET', '/system/db-changed-time');
  }

  /** Products due soon, overdue, expired, and below their minimum stock. */
  getVolatileStock(dueSoonDays) {
    return this.api('GET', '/stock/volatile', { query: { due_soon_days: dueSoonDays } });
  }

  getChores() {
    return this.api('GET', '/chores');
  }

  getBatteries() {
    return this.api('GET', '/batteries');
  }

  /** The battery objects (names): Grocy 3 does not embed them in /batteries. */
  getBatteryObjects() {
    return this.api('GET', '/objects/batteries');
  }

  getTasks() {
    return this.api('GET', '/tasks');
  }

  getShoppingList() {
    return this.api('GET', '/objects/shopping_list');
  }

  getProducts() {
    return this.api('GET', '/objects/products');
  }

  getProduct(productId) {
    return this.api('GET', `/stock/products/${encodeURIComponent(productId)}`);
  }

  getProductByBarcode(barcode) {
    return this.api('GET', `/stock/products/by-barcode/${encodeURIComponent(barcode)}`);
  }

  getChore(choreId) {
    return this.api('GET', `/chores/${encodeURIComponent(choreId)}`);
  }

  getBattery(batteryId) {
    return this.api('GET', `/batteries/${encodeURIComponent(batteryId)}`);
  }

  // --- Writing (scene actions and widget buttons) ------------------------------
  // Each one is undone from the Grocy interface (stock journal, chore and
  // battery journals, shopping list): nothing here deletes anything.

  consumeProduct(productId, amount, { spoiled = false } = {}) {
    return this.api('POST', `/stock/products/${encodeURIComponent(productId)}/consume`, {
      json: { amount, spoiled, transaction_type: 'consume' },
    });
  }

  addProductToShoppingList(productId, listId, amount, note) {
    return this.api('POST', '/stock/shoppinglist/add-product', {
      json: {
        product_id: Number(productId),
        list_id: listId,
        product_amount: amount,
        ...(note ? { note } : {}),
      },
    });
  }

  /** A free-text line (no product): a shopping_list row with a note. */
  addNoteToShoppingList(listId, note, amount) {
    return this.api('POST', '/objects/shopping_list', {
      json: { shopping_list_id: listId, note, amount },
    });
  }

  addMissingProductsToShoppingList(listId) {
    return this.api('POST', '/stock/shoppinglist/add-missing-products', {
      json: { list_id: listId },
    });
  }

  executeChore(choreId) {
    return this.api('POST', `/chores/${encodeURIComponent(choreId)}/execute`, { json: {} });
  }

  chargeBattery(batteryId) {
    return this.api('POST', `/batteries/${encodeURIComponent(batteryId)}/charge`, { json: {} });
  }

  completeTask(taskId) {
    return this.api('POST', `/tasks/${encodeURIComponent(taskId)}/complete`, { json: {} });
  }
}
