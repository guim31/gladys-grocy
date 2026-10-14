// -----------------------------------------------------------------------------
// The Grocy hub: reads the Grocy instance on a timer of the container (the
// interval chosen in the configuration), publishes the counters of the device
// when they change, fires the scene events on transitions, and runs the
// commands of the scene actions and the widget buttons.
//
// Gladys never polls the device (should_poll: false): the core scheduler does
// not poll the devices of external integrations reliably (GladysAssistant/
// Gladys#3198, not fixed in 5.2.1), and the scene events must fire even
// before the device is added. onPoll stays as a fallback (src/app.js).
//
// Load on Grocy: each cycle asks one small question, "when did the database
// last change?" (/system/db-changed-time). Everything is read again only when
// it changed, when the server's day changed, or every 15 minutes; in between,
// what is due is recomputed from the last reading and the server's clock.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { buildDevice, deviceIds, featureValues } from './devices.js';
import { ERROR_KINDS, GrocyClient, REJECTED } from './grocy/client.js';
import {
  NEVER,
  PRODUCT_STATUS,
  buildSnapshot,
  counts,
  findByName,
  flag,
  localStamp,
  num,
  parseBatteries,
  parseChores,
  parseShoppingList,
  parseTasks,
  parseUtcOffset,
  parseVersion,
  parseVolatile,
  productNames,
} from './grocy/model.js';
import { ACTION_TEXT, CONNECTION_TEXT, ERROR_TEXT, REPORT_TEXT, fill, pick } from './texts.js';

const logger = createLogger({ name: 'grocy-hub' });

// Widget keys (manifest `widgets`): permanent once published.
export const WIDGET_KEYS = Object.freeze({
  CONSUME_SOON: 'consume_soon',
  TODAY: 'today',
  SHOPPING: 'shopping_list',
});

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  PRODUCT_EXPIRING: 'product_expiring',
  CHORE_OVERDUE: 'chore_overdue',
});

export const HUB_TIMINGS = {
  // Everything is read again at least this often, changed or not.
  fullReadMs: 15 * 60_000,
  // An unchanged counter is sent again this often (Gladys flags a value older
  // than 48 h as "no recent value"; the maintainer's rule is 12 h at most).
  heartbeatMs: 6 * 3600_000,
  // Scene events sent in one cycle at most; the rest follow at the next one.
  maxEventsPerCycle: 25,
};

// Largest amount accepted from a scene (a typo of 1000 bottles stays a typo).
export const MAX_AMOUNT = 10_000;

/** An amount typed in a scene or a form: a number, or a string ("1", "0,5"). */
export function parseAmount(raw, fallback = 1) {
  if (raw === undefined || raw === null || raw === '') {
    return fallback;
  }
  const number =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string'
        ? Number(raw.trim().replace(',', '.'))
        : NaN;
  if (!Number.isFinite(number) || number <= 0 || number > MAX_AMOUNT) {
    return null;
  }
  return number;
}

const signature = (config) => JSON.stringify([config.url, config.apiKey, config.allowSelfSigned]);

/** An error shown to the user by Gladys: already translated, never logged as a failure. */
class UserError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UserError';
    this.userFacing = true;
  }
}

export class GrocyHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store persistence (src/store.js)
   * @param {Function} [options.request] HTTP seam (src/grocy/http.js)
   * @param {boolean} [options.timers] periodic timer (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   */
  constructor({ gladys, store, request, timers = true, timings, now }) {
    this.gladys = gladys;
    this.store = store;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    this.config = null;
    this.client = null;
    this.clientSignature = null;
    this.resetReading();
    this.transport = null;
    this.connection = null;
    this.saved = { baseline: false, url: null, products: [], chores: [] };
    this.pollTimer = null;
    this.stopped = false;
    /** Problems already logged, by key: their repeats go to debug. */
    this.warned = new Set();
  }

  resetReading() {
    /** Parsed answers of the last full reading. */
    this.raw = null;
    this.products = [];
    this.dbChanged = null;
    this.readAt = 0;
    this.readDay = null;
    this.version = null;
    this.utcOffset = null;
    /** What is due, recomputed every cycle. */
    this.snapshot = null;
    this.reachable = null;
    this.error = null;
    this.downSince = null;
    this.refreshing = null;
    this.widgetSignature = null;
  }

  // --- Logs ------------------------------------------------------------------
  // Info keeps the lifecycle only (Grocy connected, lost, back, user actions).
  // A problem that repeats every cycle is logged once at its own level, then
  // at debug until it clears. LOG_LEVEL=debug shows everything.

  /** Log a problem once (`level` warn or error), its repeats at debug. */
  problem(key, message, err, level = 'warn') {
    const args = err === undefined ? [message] : [message, err];
    if (this.warned.has(key)) {
      logger.debug(...args);
      return;
    }
    this.warned.add(key);
    logger[level](...args);
  }

  /** The problem `key` is gone: the next occurrence is logged again. */
  resolved(key, message) {
    if (this.warned.delete(key) && message) {
      logger.info(message);
    }
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    this.saved = {
      baseline: saved.baseline === true,
      url: typeof saved.url === 'string' ? saved.url : null,
      products: Array.isArray(saved.products)
        ? saved.products.filter((k) => typeof k === 'string')
        : [],
      chores: Array.isArray(saved.chores) ? saved.chores.filter((k) => typeof k === 'string') : [],
    };
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.gladys.forgetPublishedStates();
    this.transport = null;
    this.connection = null;
    this.widgetSignature = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    this.config = config;
    if (!config.url) {
      this.client = null;
      this.clientSignature = null;
      this.resetReading();
    } else if (this.clientSignature !== signature(config)) {
      this.client = new GrocyClient({
        url: config.url,
        apiKey: config.apiKey,
        insecure: config.allowSelfSigned,
        request: this.request,
      });
      this.clientSignature = signature(config);
      this.resetReading();
    } else {
      // Same Grocy, new options (due soon days, list, language): read again.
      this.readAt = 0;
    }
    await this.publishDevices();
    await this.refresh({ full: true });
    this.schedulePoll();
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.pollTimer);
    await this.refreshing?.catch(() => {});
    await this.store.flush();
  }

  schedulePoll() {
    clearTimeout(this.pollTimer);
    if (!this.timersEnabled || this.stopped || !this.client) {
      return;
    }
    this.pollTimer = setTimeout(async () => {
      try {
        await this.refresh();
        this.resolved('poll');
      } catch (err) {
        this.problem('poll', 'Poll failed', err, 'error');
      }
      this.schedulePoll();
    }, this.config.pollIntervalMs);
  }

  // --- Device ----------------------------------------------------------------

  async publishDevices() {
    // Even an empty list: the Discovery tab then shows no stale device.
    await this.gladys.publishDiscoveredDevices(
      this.config.url ? [buildDevice(this.gladys, this.config)] : [],
    );
  }

  /** "Search" in the Discovery tab: publish the device again, read Grocy. */
  async rediscover() {
    await this.publishDevices();
    await this.refresh({ full: true });
  }

  /** The user added the device: the states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    if (device.external_id !== deviceIds(this.gladys).device) {
      return;
    }
    await this.publishStates();
    this.refreshWidgets();
  }

  /** Gladys asks for a refresh (onPoll, a fallback): read Grocy now. */
  async pollDevice(device) {
    if (device.external_id === deviceIds(this.gladys).device) {
      await this.refresh();
    }
  }

  // --- Reading Grocy ---------------------------------------------------------

  /**
   * Read Grocy and apply what changed. Concurrent calls share the reading.
   * @param {{ full?: boolean }} [options] full: read everything, changed or not
   */
  refresh({ full = false } = {}) {
    if (!this.client) {
      return this.afterChanges();
    }
    if (this.refreshing && !full) {
      return this.refreshing;
    }
    // A full reading waits for the one in flight: that one may have started
    // before the change it must show (a command, a new configuration).
    const reading = (this.refreshing ?? Promise.resolve())
      .catch(() => {})
      .then(() => {
        if (full) {
          this.readAt = 0;
        }
        return this.read();
      })
      .finally(() => {
        if (this.refreshing === reading) {
          this.refreshing = null;
        }
      });
    this.refreshing = reading;
    return reading;
  }

  async read() {
    const client = this.client;
    try {
      const changed = await client.getDbChangedTime();
      const changedTime = typeof changed?.changed_time === 'string' ? changed.changed_time : null;
      const due =
        this.raw === null ||
        changedTime === null ||
        changedTime !== this.dbChanged ||
        this.serverNow().slice(0, 10) !== this.readDay ||
        this.now() - this.readAt >= this.timings.fullReadMs;
      if (due) {
        await this.readAll(client);
        this.dbChanged = changedTime;
        // Grocy keeps the second only: a change in the second of this reading
        // would not show as a new time. Read everything again next cycle.
        if (changedTime !== null && changedTime >= localStamp(this.now() - 2000, this.offset())) {
          this.readAt = 0;
        }
      } else {
        logger.debug('Grocy database unchanged: due items recomputed from the last reading');
      }
      if (client !== this.client) {
        return; // the configuration changed during the reading
      }
      await this.applySuccess();
    } catch (err) {
      if (client !== this.client) {
        return;
      }
      if (!err.kind) {
        throw err;
      }
      // A 400 while only reading: Grocy did not understand a request it should.
      await this.applyFailure(
        err.kind === REJECTED ? { kind: ERROR_KINDS.HTTP, message: err.message } : err,
      );
    }
  }

  async readAll(client) {
    const [info, time, volatile, chores, batteries, tasks, shopping, products] = await Promise.all([
      client.getSystemInfo(),
      // Grocy 3.0.0 has no /system/time: the container's zone then (Gladys' own).
      client
        .getSystemTime()
        .catch((err) => (err.kind === ERROR_KINDS.NOT_GROCY ? null : Promise.reject(err))),
      client.getVolatileStock(this.config.dueSoonDays),
      client.getChores(),
      client.getBatteries(),
      client.getTasks(),
      client.getShoppingList(),
      client.getProducts(),
    ]);
    // Grocy 3 does not embed the battery object (its name) in /batteries.
    const batteryObjects =
      Array.isArray(batteries) && batteries.some((row) => row && row.battery === undefined)
        ? await client.getBatteryObjects()
        : [];
    this.version = parseVersion(info);
    this.utcOffset = parseUtcOffset(time);
    const names = productNames(products);
    this.products = (Array.isArray(products) ? products : [])
      .filter((product) => product?.active === undefined || flag(product.active))
      .map((product) => ({ id: num(product?.id), name: names.get(num(product?.id)) }))
      .filter((product) => product.id !== null && product.name);
    const today = this.serverNow().slice(0, 10);
    this.raw = {
      volatile: parseVolatile(volatile, today),
      chores: parseChores(chores),
      batteries: parseBatteries(batteries, batteryObjects),
      tasks: parseTasks(tasks),
      shopping: parseShoppingList(shopping, this.config.shoppingListId, names),
    };
    this.readAt = this.now();
    this.readDay = today;
    logger.debug(
      `Grocy read: ${this.products.length} products, ${this.raw.chores.length} chores, ` +
        `${this.raw.batteries.length} batteries, ${this.raw.tasks.length} open tasks`,
    );
  }

  /** The server's local time ("YYYY-MM-DD HH:MM:SS"). */
  serverNow() {
    return localStamp(this.now(), this.offset());
  }

  /** The server's UTC offset (s); the container's zone, Gladys' own, when unknown. */
  offset() {
    return this.utcOffset ?? -new Date(this.now()).getTimezoneOffset() * 60;
  }

  async applySuccess() {
    if (this.reachable === null) {
      logger.info(`Grocy ${this.version ?? ''} connected`.replace('  ', ' '));
    } else if (this.error) {
      const minutes = Math.round((this.now() - (this.downSince ?? this.now())) / 60_000);
      logger.info(`Grocy answers again after ${minutes} min`);
    }
    this.reachable = true;
    this.error = null;
    this.downSince = null;
    this.snapshot = buildSnapshot(this.raw, this.serverNow());
    await this.publishStates();
    await this.fireTriggers();
    await this.afterChanges();
  }

  async applyFailure(err) {
    const previous = this.error?.kind;
    this.error = { kind: err.kind, message: err.message };
    if (this.reachable !== false) {
      this.downSince = this.now();
    }
    this.reachable = false;
    // One warning when the problem starts (or changes), not one per reading.
    if (previous !== err.kind) {
      logger.warn(`Grocy: ${err.message}`);
    } else {
      logger.debug(`Grocy: ${err.message} (again)`);
    }
    await this.afterChanges();
  }

  // --- Publishing to Gladys --------------------------------------------------

  async publishStates() {
    const states = featureValues(this.gladys, this.snapshot)
      .filter(({ value }) => value !== null)
      .map(({ externalId, value }) => ({ device_feature_external_id: externalId, state: value }));
    if (states.length === 0) {
      return;
    }
    try {
      // Only what changed, plus every value once per heartbeat (SDK 0.15).
      await this.gladys.publishChangedStates(states, { heartbeat: this.timings.heartbeatMs });
      this.resolved('states');
    } catch (err) {
      this.problem('states', `States refused by Gladys: ${err.message}`);
    }
  }

  async afterChanges() {
    await this.publishTransport();
    await this.publishConnectionStatus();
    const widgets = JSON.stringify([this.reachable, this.error?.kind, this.snapshot]);
    if (widgets !== this.widgetSignature) {
      this.widgetSignature = widgets;
      this.refreshWidgets();
    }
  }

  refreshWidgets() {
    for (const key of Object.values(WIDGET_KEYS)) {
      try {
        this.gladys.requestWidgetRefresh(key);
      } catch (err) {
        this.problem('widget-refresh', `Widget refresh refused: ${err.message}`);
      }
    }
  }

  async publishTransport() {
    if (!this.config.url || this.reachable === null) {
      return;
    }
    const transport = this.reachable ? DEVICE_TRANSPORTS.LOCAL : DEVICE_TRANSPORTS.UNREACHABLE;
    if (transport === this.transport) {
      return;
    }
    try {
      await this.gladys.publishTransports([
        { external_id: deviceIds(this.gladys).device, transport },
      ]);
      this.transport = transport;
      this.resolved('transports');
    } catch (err) {
      this.problem('transports', `Transport refused by Gladys: ${err.message}`);
    }
  }

  /** The status under the integration name. */
  connectionStatus() {
    if (!this.config.url) {
      return {
        connected: false,
        message: this.config.invalidUrl ? CONNECTION_TEXT.invalidUrl : CONNECTION_TEXT.noUrl,
      };
    }
    if (this.error) {
      return { connected: false, message: ERROR_TEXT[this.error.kind] ?? ERROR_TEXT.http };
    }
    return { connected: this.reachable !== false };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.resolved('connection-status');
    } catch (err) {
      this.problem('connection-status', `Connection status refused by Gladys: ${err.message}`);
    }
  }

  // --- Scene triggers ----------------------------------------------------------

  /**
   * One event per product entering a status (due soon, overdue, expired) and
   * per chore becoming overdue. What was already due when the integration
   * first started is taken as known: only what becomes due afterwards is
   * announced. The announced keys live in /data.
   */
  async fireTriggers() {
    const { products, chores } = this.snapshot;
    const productEvents = new Map();
    for (const status of [
      PRODUCT_STATUS.DUE_SOON,
      PRODUCT_STATUS.OVERDUE,
      PRODUCT_STATUS.EXPIRED,
    ]) {
      const entries =
        status === PRODUCT_STATUS.DUE_SOON
          ? products.dueSoon
          : status === PRODUCT_STATUS.OVERDUE
            ? products.overdue
            : products.expired;
      for (const entry of entries) {
        productEvents.set(`${entry.productId}|${entry.date}|${status}`, {
          product: entry.name,
          status,
          due_date: entry.date,
          days_left: entry.daysLeft ?? 0,
          amount: entry.amount,
        });
      }
    }
    const choreEvents = new Map(
      chores.overdue.map((chore) => [
        `${chore.id}|${chore.next}`,
        { chore: chore.name, assigned_to: chore.assignedTo, due_time: chore.next.slice(0, 16) },
      ]),
    );

    // First start, or another Grocy: what is due now is taken as known.
    if (!this.saved.baseline || this.saved.url !== this.config.url) {
      this.saved = {
        baseline: true,
        url: this.config.url,
        products: [...productEvents.keys()],
        chores: [...choreEvents.keys()],
      };
      this.store.save(this.saved);
      return;
    }

    let budget = this.timings.maxEventsPerCycle;
    const announce = async (trigger, events, known) => {
      const kept = known.filter((key) => events.has(key)); // what is no longer due is forgotten
      for (const [key, data] of events) {
        if (kept.includes(key) || budget <= 0) {
          continue;
        }
        budget -= 1;
        if (await this.fire(trigger, data)) {
          kept.push(key);
        }
      }
      return kept;
    };
    const products2 = await announce(TRIGGERS.PRODUCT_EXPIRING, productEvents, this.saved.products);
    const chores2 = await announce(TRIGGERS.CHORE_OVERDUE, choreEvents, this.saved.chores);
    if (
      JSON.stringify(products2) !== JSON.stringify(this.saved.products) ||
      JSON.stringify(chores2) !== JSON.stringify(this.saved.chores)
    ) {
      this.saved = { ...this.saved, products: products2, chores: chores2 };
      this.store.save(this.saved);
    }
  }

  async fire(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
      logger.debug(`Scene event ${key}: ${JSON.stringify(data)}`);
      this.resolved('scene-event');
      return true;
    } catch (err) {
      this.problem('scene-event', `Scene event ${key} refused by Gladys: ${err.message}`);
      return false;
    }
  }

  // --- Commands ----------------------------------------------------------------

  get language() {
    return this.config?.language ?? 'fr';
  }

  /** Throw a message of ACTION_TEXT, in the configured language. */
  fail(key, values = {}) {
    throw new UserError(fill(pick(ACTION_TEXT[key], this.language), values));
  }

  /** The client, or a clear error when Grocy is not configured. */
  requireClient() {
    if (!this.client) {
      this.fail('notConfigured');
    }
    return this.client;
  }

  /** A failed call to Grocy, as a message for the user. */
  explain(err, name) {
    if (err.userFacing) {
      return err;
    }
    if (err.kind === REJECTED) {
      if (/cannot be > current/i.test(err.grocyMessage ?? '')) {
        return new UserError(fill(pick(ACTION_TEXT.notEnoughStock, this.language), { name }));
      }
      return new UserError(
        fill(pick(ACTION_TEXT.refused, this.language), { reason: err.grocyMessage || '?' }),
      );
    }
    if (err.kind && ERROR_TEXT[err.kind]) {
      return new UserError(pick(ERROR_TEXT[err.kind], this.language));
    }
    return err;
  }

  /** Run a command, then read Grocy again so the counters follow at once. */
  async command(name, run) {
    const client = this.requireClient();
    let result;
    try {
      result = await run(client);
    } catch (err) {
      if (!err.userFacing) {
        logger.warn(`Command failed: ${err.message}`);
      }
      throw this.explain(err, name);
    }
    await this.refresh({ full: true }).catch((err) =>
      this.problem('refresh-after-command', `Refresh after a command failed: ${err.message}`),
    );
    return result;
  }

  /** Pick one item by the name typed in a scene, or say why not. */
  resolveName(items, typed, notFoundKey) {
    const name = typeof typed === 'string' ? typed.trim() : typed == null ? '' : String(typed);
    if (!name) {
      this.fail('emptyName');
    }
    const { match, candidates } = findByName(items, name);
    if (match) {
      return match;
    }
    if (candidates.length > 1) {
      this.fail('ambiguous', {
        name,
        names: candidates
          .slice(0, 3)
          .map((item) => item.name)
          .join(', '),
      });
    }
    return this.fail(notFoundKey, { name });
  }

  /** The product lists change with the database: read them now if a name is unknown. */
  async withFreshLists(find) {
    try {
      return find();
    } catch (err) {
      if (!err.userFacing || this.raw === null || this.now() - this.readAt < 5_000) {
        throw err;
      }
      await this.refresh({ full: true });
      return find();
    }
  }

  /**
   * Consume a product, found by name or barcode.
   * @returns {Promise<{ product: string, amount: number, stock_left: number }>}
   */
  async consumeProduct(typed, rawAmount, { spoiled = false } = {}) {
    const amount = parseAmount(rawAmount);
    if (amount === null) {
      this.fail('badAmount');
    }
    const client = this.requireClient();
    if (this.raw === null) {
      await this.refresh({ full: true });
    }
    const product = await this.findProduct(client, typed);
    const result = await this.command(product.name, async () => {
      await client.consumeProduct(product.id, amount, { spoiled });
      const details = await client.getProduct(product.id).catch(() => null);
      return {
        product: product.name,
        amount,
        stock_left: num(details?.stock_amount_aggregated) ?? num(details?.stock_amount) ?? 0,
      };
    });
    logger.info(`Consumed ${amount} × ${product.name}${spoiled ? ' (spoiled)' : ''}`);
    return result;
  }

  /** A product by its name (exact, else the only one containing it) or by a barcode. */
  async findProduct(client, typed) {
    const name = typeof typed === 'string' ? typed.trim() : typed == null ? '' : String(typed);
    if (!name) {
      this.fail('emptyName');
    }
    const found = findByName(this.products, name);
    if (found.exact) {
      return found.match;
    }
    // Not an exact name: maybe a barcode (EAN, Grocycode...).
    if (!/\s/.test(name)) {
      try {
        const details = await client.getProductByBarcode(name);
        const id = num(details?.product?.id);
        if (id !== null) {
          return { id, name: String(details.product.name ?? name) };
        }
      } catch (err) {
        if (err.kind !== REJECTED) {
          throw this.explain(err, name);
        }
      }
    }
    return this.withFreshLists(() => this.resolveName(this.products, name, 'productNotFound'));
  }

  /**
   * Add an item to the configured shopping list: the product of that exact
   * name, or a free-text line.
   * @returns {Promise<{ item: string, known_product: boolean, items_on_list: number }>}
   */
  async addToShoppingList(typed, rawAmount, note = '') {
    const amount = parseAmount(rawAmount);
    if (amount === null) {
      this.fail('badAmount');
    }
    const name = typeof typed === 'string' ? typed.trim() : typed == null ? '' : String(typed);
    if (!name) {
      this.fail('emptyName');
    }
    const client = this.requireClient();
    if (this.raw === null) {
      await this.refresh({ full: true });
    }
    const listId = this.config.shoppingListId;
    const extra = typeof note === 'string' ? note.trim().slice(0, 200) : '';
    // A partial match would put another product on the list: exact names only.
    const found = findByName(this.products, name);
    const product = found.exact ? found.match : null;
    await this.command(name, () =>
      product
        ? client.addProductToShoppingList(product.id, listId, amount, extra)
        : client.addNoteToShoppingList(listId, extra ? `${name} (${extra})` : name, amount),
    );
    logger.info(`Added ${amount} × ${product?.name ?? name} to the shopping list`);
    return {
      item: product?.name ?? name,
      known_product: product !== null,
      items_on_list: this.snapshot?.shopping.length ?? 0,
    };
  }

  /** Add the products below their minimum stock to the shopping list (widget button). */
  async addMissingProducts() {
    const before = this.snapshot?.shopping.length ?? 0;
    await this.command('', (client) =>
      client.addMissingProductsToShoppingList(this.config.shoppingListId),
    );
    const after = this.snapshot?.shopping.length ?? 0;
    logger.info('Missing products added to the shopping list');
    return Math.max(0, after - before);
  }

  /** The chores, all of them (a manual chore is never due, but can be done). */
  async allChores() {
    if (this.raw === null) {
      await this.refresh({ full: true });
    }
    return this.raw?.chores ?? [];
  }

  /**
   * Track an execution of a chore, by name or (widget) by id.
   * @returns {Promise<{ chore: string, next_time: string }>}
   */
  async executeChore({ name, id } = {}) {
    const client = this.requireClient();
    const chores = await this.allChores();
    const chore =
      id !== undefined
        ? (chores.find((item) => item.id === num(id)) ?? this.fail('unknownItem'))
        : await this.withFreshLists(() =>
            this.resolveName(this.raw?.chores ?? [], name, 'choreNotFound'),
          );
    const result = await this.command(chore.name, async () => {
      await client.executeChore(chore.id);
      const details = await client.getChore(chore.id).catch(() => null);
      const next = String(details?.next_estimated_execution_time ?? '').slice(0, 16);
      return { chore: chore.name, next_time: next.startsWith(NEVER) ? '' : next };
    });
    logger.info(`Chore "${chore.name}" done`);
    return result;
  }

  /**
   * Track a charge cycle of a battery, by name or (widget) by id.
   * @returns {Promise<{ battery: string, next_charge: string }>}
   */
  async chargeBattery({ name, id } = {}) {
    const client = this.requireClient();
    if (this.raw === null) {
      await this.refresh({ full: true });
    }
    const batteries = this.raw?.batteries ?? [];
    const battery =
      id !== undefined
        ? (batteries.find((item) => item.id === num(id)) ?? this.fail('unknownItem'))
        : await this.withFreshLists(() =>
            this.resolveName(this.raw?.batteries ?? [], name, 'batteryNotFound'),
          );
    const result = await this.command(battery.name, async () => {
      await client.chargeBattery(battery.id);
      const details = await client.getBattery(battery.id).catch(() => null);
      const next = String(details?.next_estimated_charge_time ?? '').slice(0, 16);
      return { battery: battery.name, next_charge: next.startsWith(NEVER) ? '' : next };
    });
    logger.info(`Battery "${battery.name}" charged`);
    return result;
  }

  /** Mark a task as completed (widget button: tasks have no scene action). */
  async completeTask(id) {
    const client = this.requireClient();
    const task = (this.raw?.tasks ?? []).find((item) => item.id === num(id));
    if (!task) {
      this.fail('unknownItem');
    }
    await this.command(task.name, () => client.completeTask(task.id));
    logger.info(`Task "${task.name}" completed`);
    return { task: task.name };
  }

  // --- Reports -----------------------------------------------------------------

  /** "Test the connection": read Grocy now, a short report. */
  async testConnection() {
    await this.refresh({ full: true });
    const status = this.connectionStatus();
    if (!this.config.url || this.error) {
      return status.message;
    }
    const c = counts(this.snapshot);
    const message = {};
    for (const [language, text] of Object.entries(REPORT_TEXT)) {
      message[language] = [
        text.ok(this.version ?? '?'),
        text.products(c.productsDueSoon, c.productsOverdue + c.productsExpired),
        text.chores(c.choresDueToday, c.choresOverdue),
        text.shopping(c.shoppingItems),
      ].join('\n');
    }
    return message;
  }
}
