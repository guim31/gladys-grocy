// -----------------------------------------------------------------------------
// An in-memory Grocy behind the `request` seam of the client
// (src/grocy/http.js). It answers like Grocy 4.7 (grocy.openapi.json, and the
// PHP of grocy/grocy for the rules: due soon, overdue, expired, below minimum
// stock, chores and batteries rescheduled on execution), on the demo data of
// Grocy recorded by pygrocy (test/fixtures/grocy/pygrocy/), moved to dates
// around the test clock. `grocy3: true` sends every number as a string, as
// Grocy 3 did, and leaves the battery object out of /batteries.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/grocy/${name}.json`, import.meta.url), 'utf8'));

export const API_KEY = 'fake-grocy-api-key-0123456789';

const json = (status, body) => ({
  status,
  headers: { 'content-type': 'application/json' },
  body: body === undefined ? '' : JSON.stringify(body),
});
const error400 = (message) => json(400, { error_message: message });

/** Grocy 3: every number and boolean as a string. */
function stringify(value) {
  if (Array.isArray(value)) {
    return value.map(stringify);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, stringify(v)]));
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }
  return value;
}

const pad = (n) => String(n).padStart(2, '0');
/** "YYYY-MM-DD HH:MM:SS" of a UTC instant shifted by `offsetSeconds`. */
const stampOf = (ms, offsetSeconds) => {
  const d = new Date(ms + offsetSeconds * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
};
const addDays = (date, days) => {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * The demo household, dated relative to `today` (the server's local date).
 * Names and structure come from the Grocy demo recorded by pygrocy.
 */
export function demoData(today) {
  return {
    products: [
      { id: 1, name: 'Cookies', due_type: 1, min_stock_amount: 8 },
      { id: 2, name: 'Chocolate', due_type: 1, min_stock_amount: 8 },
      { id: 3, name: 'Gummy bears', due_type: 1, min_stock_amount: 8 },
      { id: 4, name: 'Crisps', due_type: 1, min_stock_amount: 10 },
      { id: 12, name: 'Paprika', due_type: 1, min_stock_amount: 0 },
      { id: 13, name: 'Cucumber', due_type: 1, min_stock_amount: 0 },
      { id: 14, name: 'Radish', due_type: 1, min_stock_amount: 0 },
      { id: 15, name: 'Tomato', due_type: 1, min_stock_amount: 0 },
      { id: 17, name: 'Sieved tomatoes', due_type: 1, min_stock_amount: 0 },
      { id: 20, name: 'Minced meat', due_type: 2, min_stock_amount: 0 },
      { id: 23, name: 'Milk', due_type: 1, min_stock_amount: 0 },
      { id: 24, name: 'Crème fraîche', due_type: 2, min_stock_amount: 0 },
      { id: 25, name: 'Apple juice', due_type: 1, min_stock_amount: 0, active: 0 },
    ],
    barcodes: { 42141099: 4 },
    stock: [
      { product_id: 2, amount: 5, best_before_date: addDays(today, 90) },
      { product_id: 3, amount: 4, best_before_date: addDays(today, 60) },
      { product_id: 4, amount: 25, best_before_date: addDays(today, -400) },
      { product_id: 12, amount: 5, best_before_date: addDays(today, 2) },
      { product_id: 13, amount: 5, best_before_date: addDays(today, -2) },
      { product_id: 14, amount: 5, best_before_date: addDays(today, 2) },
      { product_id: 15, amount: 5, best_before_date: addDays(today, -2) },
      { product_id: 20, amount: 1, best_before_date: addDays(today, -1) },
      { product_id: 23, amount: 2, best_before_date: today },
      { product_id: 24, amount: 1, best_before_date: addDays(today, 10) },
    ],
    chores: [
      {
        id: 1,
        name: 'Change towels in the bathroom',
        period_days: 3,
        next: `${addDays(today, 3)} 23:59:59`,
        track_date_only: 1,
        assigned: 'Demo User 4',
      },
      {
        id: 2,
        name: 'Mop the kitchen floor',
        period_days: 7,
        next: `${addDays(today, -4)} 23:59:59`,
        track_date_only: 1,
        assigned: 'Demo User 4',
      },
      {
        id: 3,
        name: 'Take out the trash',
        period_days: 2,
        next: `${today} 23:59:59`,
        track_date_only: 1,
        assigned: 'Demo User',
      },
      {
        id: 4,
        name: 'Vacuum the living room floor',
        period_days: 7,
        next: `${addDays(today, 1)} 23:59:59`,
        track_date_only: 1,
        assigned: null,
      },
      {
        id: 5,
        name: 'Clean the litter box',
        period_days: 1,
        next: `${today} 23:59:59`,
        track_date_only: 1,
        assigned: 'Demo User 4',
      },
      {
        id: 6,
        name: 'Water the plants',
        period_days: 2,
        next: `${today} 18:00:00`,
        track_date_only: 0,
        assigned: 'Demo User 2',
      },
      // A manual chore: never due.
      { id: 7, name: 'Descale the kettle', period_days: 0, next: null, track_date_only: 1 },
    ],
    batteries: [
      {
        id: 1,
        name: 'TV remote control',
        charge_interval_days: 180,
        next: `${addDays(today, 90)} 21:19:14`,
      },
      { id: 2, name: 'Alarm clock', charge_interval_days: 0, next: '2999-12-31 23:59:59' },
      {
        id: 3,
        name: 'Heat remote control',
        charge_interval_days: 60,
        next: `${addDays(today, -3)} 19:33:45`,
      },
      {
        id: 4,
        name: 'Smoke detector',
        charge_interval_days: 60,
        next: `${addDays(today, 20)} 19:33:45`,
      },
    ],
    tasks: [
      { id: 1, name: 'Task1', due_date: null },
      { id: 2, name: 'Fix the bike', due_date: addDays(today, -1), assigned: 'Demo User' },
      { id: 3, name: 'Call the plumber', due_date: today },
      { id: 4, name: 'Task4', due_date: addDays(today, 4) },
    ],
    shopping: [
      {
        id: 1,
        shopping_list_id: 1,
        product_id: null,
        note: 'Some good snacks',
        amount: 1,
        done: 0,
      },
      { id: 2, shopping_list_id: 1, product_id: 20, note: null, amount: 1, done: 0 },
      { id: 3, shopping_list_id: 1, product_id: 17, note: null, amount: 1, done: 0 },
      { id: 4, shopping_list_id: 1, product_id: 1, note: null, amount: 8, done: 1 },
      { id: 5, shopping_list_id: 2, product_id: 2, note: null, amount: 3, done: 0 },
    ],
  };
}

export class FakeGrocy {
  /**
   * @param {object} [options]
   * @param {() => number} [options.now] the clock (UTC milliseconds)
   * @param {number} [options.utcOffset] the server's zone, in seconds (Europe/Paris in summer)
   * @param {string} [options.apiKey] '' for a Grocy without authentication
   * @param {boolean} [options.grocy3] numbers as strings, no battery object
   * @param {string} [options.version]
   */
  constructor({
    now = () => Date.now(),
    utcOffset = 7200,
    apiKey = API_KEY,
    grocy3 = false,
    version = grocy3 ? '3.3.1' : '4.7.1',
  } = {}) {
    this.now = now;
    this.utcOffset = utcOffset;
    this.apiKey = apiKey;
    this.grocy3 = grocy3;
    this.version = version;
    this.online = true;
    this.requests = [];
    this.data = demoData(this.local().slice(0, 10));
    this.changes = 0;
    // Last changed an hour before the test starts.
    this.changed = stampOf(this.now() - 3600_000, this.utcOffset);
    this.failNext = null; // e.g. 500
  }

  /** The server's local time. */
  local() {
    return stampOf(this.now(), this.utcOffset);
  }

  /** The database changed (a mutation of the test or of the API). */
  touch() {
    this.changes += 1;
    // Grocy keeps the second only, like here.
    this.changed = this.local();
  }

  today() {
    return this.local().slice(0, 10);
  }

  product(id) {
    return this.data.products.find((p) => p.id === Number(id) && p.active !== 0);
  }

  stockOf(id) {
    return this.data.stock.find((s) => s.product_id === Number(id));
  }

  productObject(product) {
    return {
      id: product.id,
      name: product.name,
      description: null,
      active: product.active ?? 1,
      location_id: 2,
      qu_id_stock: 3,
      min_stock_amount: product.min_stock_amount,
      due_type: product.due_type,
      picture_file_name: null,
    };
  }

  stockRow(stock) {
    const product = this.product(stock.product_id);
    return {
      product_id: stock.product_id,
      amount: stock.amount,
      amount_aggregated: stock.amount,
      amount_opened: 0,
      amount_opened_aggregated: 0,
      best_before_date: stock.best_before_date,
      is_aggregated_amount: 0,
      due_type: product.due_type,
      product: this.productObject(product),
    };
  }

  volatile(days) {
    const today = this.today();
    const until = addDays(today, days);
    const rows = this.data.stock.filter((s) => s.amount > 0 && this.product(s.product_id));
    const missing = this.data.products
      .filter((p) => p.active !== 0 && p.min_stock_amount > 0)
      .map((p) => ({ product: p, amount: this.stockOf(p.id)?.amount ?? 0 }))
      .filter(({ product, amount }) => amount < product.min_stock_amount)
      .map(({ product, amount }) => ({
        id: product.id,
        name: product.name,
        amount_missing: product.min_stock_amount - amount,
        is_partly_in_stock: amount > 0 ? 1 : 0,
      }));
    return {
      due_products: rows
        .filter((s) => s.best_before_date >= today && s.best_before_date <= until)
        .map((s) => this.stockRow(s)),
      overdue_products: rows.filter((s) => s.best_before_date < today).map((s) => this.stockRow(s)),
      expired_products: rows
        .filter((s) => s.best_before_date < today && this.product(s.product_id).due_type === 2)
        .map((s) => this.stockRow(s)),
      missing_products: missing,
    };
  }

  choreRow(chore) {
    return {
      id: chore.id,
      chore_id: chore.id,
      chore_name: chore.name,
      last_tracked_time: null,
      next_estimated_execution_time: chore.next,
      track_date_only: chore.track_date_only,
      next_execution_assigned_to_user_id: chore.assigned ? 1 : null,
      is_rescheduled: 0,
      is_reassigned: 0,
      next_execution_assigned_user: chore.assigned
        ? { id: 1, username: chore.assigned, display_name: chore.assigned }
        : null,
    };
  }

  batteryRow(battery) {
    const row = {
      id: battery.id,
      battery_id: battery.id,
      last_tracked_time: null,
      next_estimated_charge_time: battery.next,
    };
    if (!this.grocy3) {
      row.battery = {
        id: battery.id,
        name: battery.name,
        charge_interval_days: battery.charge_interval_days,
        active: 1,
      };
    }
    return row;
  }

  // --- HTTP ------------------------------------------------------------------

  /** The `request` seam: (url, options) → { status, headers, body }. */
  async handle(url, { method = 'GET', headers = {}, json: body } = {}) {
    const target = new URL(url);
    const path = target.pathname.replace(/^.*?\/api(?=\/)/, '');
    this.requests.push({ method, path, query: Object.fromEntries(target.searchParams), body });
    if (!this.online) {
      const error = new Error('connect ECONNREFUSED');
      error.code = 'ECONNREFUSED';
      throw error;
    }
    if (this.failNext) {
      const status = this.failNext;
      this.failNext = null;
      return json(status, { error_message: 'Internal error' });
    }
    if (this.apiKey && headers['GROCY-API-KEY'] !== this.apiKey) {
      return json(401);
    }
    const answer = this.route(method, path, target.searchParams, body ?? {});
    if (this.grocy3 && answer.status === 200 && answer.body) {
      answer.body = JSON.stringify(stringify(JSON.parse(answer.body)));
    }
    return answer;
  }

  route(method, path, query, body) {
    const today = this.today();
    let match;
    if (method === 'GET') {
      if (path === '/system/info') {
        return json(200, {
          grocy_version: { Version: this.version, ReleaseDate: '2026-09-04' },
          php_version: '8.3.6',
          sqlite_version: '3.45.1',
        });
      }
      if (path === '/system/time') {
        return json(200, {
          timezone: this.utcOffset === 0 ? 'UTC' : 'Europe/Paris',
          time_local: this.local(),
          time_local_sqlite3: this.local(),
          time_utc: stampOf(this.now(), 0),
          timestamp: Math.floor(this.now() / 1000),
          offset: 0,
        });
      }
      if (path === '/system/db-changed-time') {
        return json(200, { changed_time: this.changed });
      }
      if (path === '/stock/volatile') {
        return json(200, this.volatile(Number(query.get('due_soon_days') || 5)));
      }
      if (path === '/chores') {
        return json(
          200,
          this.data.chores.map((chore) => this.choreRow(chore)),
        );
      }
      if ((match = path.match(/^\/chores\/(\d+)$/))) {
        const chore = this.data.chores.find((c) => c.id === Number(match[1]));
        return chore
          ? json(200, {
              chore: { id: chore.id, name: chore.name },
              next_estimated_execution_time: chore.next,
            })
          : error400('Chore does not exist');
      }
      if (path === '/batteries') {
        return json(
          200,
          this.data.batteries.map((battery) => this.batteryRow(battery)),
        );
      }
      if (path === '/objects/batteries') {
        return json(
          200,
          this.data.batteries.map((b) => ({
            id: b.id,
            name: b.name,
            charge_interval_days: b.charge_interval_days,
            active: 1,
          })),
        );
      }
      if ((match = path.match(/^\/batteries\/(\d+)$/))) {
        const battery = this.data.batteries.find((b) => b.id === Number(match[1]));
        return battery
          ? json(200, {
              battery: { id: battery.id, name: battery.name },
              next_estimated_charge_time: battery.next,
            })
          : error400('Battery does not exist');
      }
      if (path === '/tasks') {
        return json(
          200,
          this.data.tasks
            .filter((task) => !task.done)
            .map((task) => ({
              id: task.id,
              name: task.name,
              description: null,
              due_date: task.due_date,
              done: 0,
              assigned_to_user: task.assigned ? { id: 1, display_name: task.assigned } : null,
            })),
        );
      }
      if (path === '/objects/shopping_list') {
        return json(200, this.data.shopping);
      }
      if (path === '/objects/products') {
        return json(
          200,
          this.data.products.map((p) => this.productObject(p)),
        );
      }
      if ((match = path.match(/^\/stock\/products\/by-barcode\/([^/]+)$/))) {
        const id = this.data.barcodes[decodeURIComponent(match[1])];
        return id
          ? this.details(id)
          : error400(`No product with barcode ${decodeURIComponent(match[1])} found`);
      }
      if ((match = path.match(/^\/stock\/products\/(\d+)$/))) {
        return this.details(match[1]);
      }
    }
    if (method === 'POST') {
      if ((match = path.match(/^\/stock\/products\/(\d+)\/consume$/))) {
        const product = this.product(match[1]);
        if (!product) {
          return error400('Product does not exist or is inactive');
        }
        const stock = this.stockOf(product.id);
        if (!(body.amount > 0)) {
          return error400("Amount can't be <= 0");
        }
        if (!stock || stock.amount < body.amount) {
          return error400(
            'Amount to be consumed cannot be > current stock amount (if supplied, at the desired location)',
          );
        }
        stock.amount -= body.amount;
        this.touch();
        return json(200, [
          {
            id: 81,
            product_id: product.id,
            amount: -body.amount,
            transaction_type: 'consume',
            spoiled: body.spoiled ? 1 : 0,
          },
        ]);
      }
      if (path === '/stock/shoppinglist/add-product') {
        const product = this.product(body.product_id);
        if (!product) {
          return error400('Product does not exist or is inactive');
        }
        const listId = body.list_id ?? 1;
        const row = this.data.shopping.find(
          (r) => r.product_id === product.id && r.shopping_list_id === listId && !r.done,
        );
        if (row) {
          row.amount += body.product_amount ?? 1;
        } else {
          this.data.shopping.push({
            id: this.data.shopping.length + 10,
            shopping_list_id: listId,
            product_id: product.id,
            note: body.note ?? null,
            amount: body.product_amount ?? 1,
            done: 0,
          });
        }
        this.touch();
        return json(204);
      }
      if (path === '/objects/shopping_list') {
        const id = this.data.shopping.length + 10;
        this.data.shopping.push({
          id,
          shopping_list_id: body.shopping_list_id ?? 1,
          product_id: null,
          note: body.note ?? null,
          amount: body.amount ?? 1,
          done: 0,
        });
        this.touch();
        return json(200, { created_object_id: id });
      }
      if (path === '/stock/shoppinglist/add-missing-products') {
        const listId = body.list_id ?? 1;
        for (const missing of this.volatile(5).missing_products) {
          const row = this.data.shopping.find(
            (r) => r.product_id === missing.id && r.shopping_list_id === listId && !r.done,
          );
          if (!row) {
            this.data.shopping.push({
              id: this.data.shopping.length + 10,
              shopping_list_id: listId,
              product_id: missing.id,
              note: null,
              amount: missing.amount_missing,
              done: 0,
            });
          }
        }
        this.touch();
        return json(204);
      }
      if ((match = path.match(/^\/chores\/(\d+)\/execute$/))) {
        const chore = this.data.chores.find((c) => c.id === Number(match[1]));
        if (!chore) {
          return error400('Chore does not exist');
        }
        if (chore.period_days > 0) {
          chore.next = chore.track_date_only
            ? `${addDays(today, chore.period_days)} 23:59:59`
            : `${addDays(today, chore.period_days)} ${this.local().slice(11)}`;
        }
        this.touch();
        return json(200, { id: 153, chore_id: chore.id, tracked_time: this.local(), undone: 0 });
      }
      if ((match = path.match(/^\/batteries\/(\d+)\/charge$/))) {
        const battery = this.data.batteries.find((b) => b.id === Number(match[1]));
        if (!battery) {
          return error400('Battery does not exist');
        }
        if (battery.charge_interval_days > 0) {
          battery.next = `${addDays(today, battery.charge_interval_days)} ${this.local().slice(11)}`;
        }
        this.touch();
        return json(200, { id: 11, battery_id: battery.id, tracked_time: this.local(), undone: 0 });
      }
      if ((match = path.match(/^\/tasks\/(\d+)\/complete$/))) {
        const task = this.data.tasks.find((t) => t.id === Number(match[1]) && !t.done);
        if (!task) {
          return error400('Task does not exist');
        }
        task.done = 1;
        this.touch();
        return json(204);
      }
    }
    return {
      status: 404,
      headers: { 'content-type': 'text/html' },
      body: '<html><body>Not found</body></html>',
    };
  }

  details(id) {
    const product = this.product(id);
    if (!product) {
      return error400('Product does not exist or is inactive');
    }
    const stock = this.stockOf(product.id);
    return json(200, {
      product: this.productObject(product),
      product_barcodes: [],
      stock_amount: stock?.amount ?? 0,
      stock_amount_aggregated: stock?.amount ?? 0,
      next_due_date: stock?.best_before_date ?? null,
    });
  }
}

/** A fake network: base URL → FakeGrocy (a server may sit below a path). */
export function createNetwork(servers = {}) {
  const entries = Object.entries(servers);
  return {
    servers: new Map(entries),
    async request(url, options) {
      const found = entries.find(([base]) => url.startsWith(`${base}/api/`));
      if (!found) {
        // An origin that answers (a reverse proxy, a NAS page) but no Grocy below it.
        if (entries.some(([base]) => new URL(base).origin === new URL(url).origin)) {
          return { status: 404, headers: { 'content-type': 'text/html' }, body: '<html></html>' };
        }
        const error = new Error('connect EHOSTUNREACH');
        error.code = 'EHOSTUNREACH';
        throw error;
      }
      return found[1].handle(url, options);
    },
  };
}
