// -----------------------------------------------------------------------------
// The hub against a fake Grocy: what it reads and when, the states it
// publishes, the scene events it fires, how it lives through an outage and a
// new configuration, and the commands of the scene actions.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TRIGGERS } from '../src/hub.js';
import {
  FakeGrocy,
  GROCY_URL,
  baseConfig,
  createAll,
  createClock,
  createWorld,
  deviceId,
  featureId,
} from './helpers/world.js';

async function world(t, options = {}) {
  const clock = options.clock ?? createClock();
  const w = await createWorld({ clock, ...options });
  t.after(() => w.app.stop());
  return w;
}

const reads = (server, path) => server.requests.filter((r) => r.path === path).length;
const MINUTE = 60_000;

test('an unchanged database costs one small request per cycle', async (t) => {
  const w = await world(t);
  const before = reads(w.server, '/chores');
  for (let i = 0; i < 5; i += 1) {
    w.clock.advance(MINUTE);
    await w.hub.refresh();
  }
  assert.equal(reads(w.server, '/chores') - before, 0, 'nothing read again');
  assert.equal(reads(w.server, '/system/db-changed-time'), 6);
});

test('a change in Grocy is read at the next cycle', async (t) => {
  const w = await world(t);
  w.clock.advance(MINUTE);
  w.server.data.stock.find((s) => s.product_id === 23).amount = 0; // the milk is gone
  w.server.touch();
  w.clock.advance(MINUTE);
  await w.hub.refresh();
  assert.equal(w.fake.lastState(featureId(w.gladys, 'products_due_soon')), 2);
});

test('everything is read again every 15 minutes and when the day changes', async (t) => {
  const w = await world(t);
  const before = reads(w.server, '/stock/volatile');
  w.clock.advance(16 * MINUTE);
  await w.hub.refresh();
  assert.equal(reads(w.server, '/stock/volatile') - before, 1);
  // 23:59 → 00:01 in Paris: Grocy's "due soon" window moved.
  w.clock.time = Date.UTC(2026, 9, 14, 21, 59, 0);
  await w.hub.refresh();
  const lastDay = reads(w.server, '/stock/volatile');
  w.clock.time = Date.UTC(2026, 9, 14, 22, 1, 0);
  await w.hub.refresh();
  assert.equal(reads(w.server, '/stock/volatile') - lastDay, 1);
});

test('time alone moves a chore from "due today" to "overdue", without reading', async (t) => {
  const w = await world(t);
  assert.equal(w.fake.lastState(featureId(w.gladys, 'chores_due_today')), 3);
  assert.equal(w.fake.lastState(featureId(w.gladys, 'chores_overdue')), 1);
  // "Water the plants" is due at 18:00 in Paris (16:00 UTC).
  w.clock.time = Date.UTC(2026, 9, 14, 16, 5, 0);
  await w.hub.refresh();
  assert.equal(w.fake.lastState(featureId(w.gladys, 'chores_due_today')), 2);
  assert.equal(w.fake.lastState(featureId(w.gladys, 'chores_overdue')), 2);
});

test('the server zone of Grocy decides what "today" is', async (t) => {
  // 23:30 UTC: still the 14th in UTC, already the 15th in Paris.
  const clock = createClock(Date.UTC(2026, 9, 14, 21, 0, 0));
  const w = await world(t, { clock });
  clock.time = Date.UTC(2026, 9, 14, 22, 30, 0);
  await w.hub.refresh();
  assert.equal(w.hub.serverNow(), '2026-10-15 00:30:00');
  // The chores of the 14th are now overdue; the vacuuming of the 15th is due today.
  assert.equal(w.fake.lastState(featureId(w.gladys, 'chores_overdue')), 4);
  assert.equal(w.fake.lastState(featureId(w.gladys, 'chores_due_today')), 1);
});

test('only changed states are published, and every value again after 6 hours', async (t) => {
  // The SDK dates the published values with Date.now().
  const clock = createClock(Date.UTC(2026, 9, 14, 0, 0, 0));
  t.mock.timers.enable({ apis: ['Date'], now: clock.time });
  const advance = (ms) => {
    clock.advance(ms);
    t.mock.timers.tick(ms);
  };
  const w = await world(t, { clock });
  const count = () => w.fake.states.length;
  const first = count();
  assert.equal(first, 10, 'every counter once at start');
  advance(MINUTE);
  await w.hub.refresh();
  assert.equal(count(), first, 'nothing changed, nothing sent');
  advance(6 * 60 * MINUTE);
  await w.hub.refresh();
  assert.equal(count(), first + 10, 'heartbeat');
});

test('the states are sent again when the user adds the device', async (t) => {
  const w = await world(t);
  const before = w.fake.states.length;
  await createAll(w);
  assert.equal(w.fake.states.length - before, 10);
  assert.ok(w.fake.widgetRefreshes.length > 0);
});

test('the device is published without polling, its transport follows Grocy', async (t) => {
  const w = await world(t);
  const [device] = w.fake.discoveredDevices;
  assert.equal(device.should_poll, false);
  assert.equal(device.poll_frequency, undefined);
  assert.deepEqual(w.fake.transports.flat(), [
    { device_external_id: deviceId(w.gladys), transport: 'local' },
  ]);
});

test('an outage: unreachable once, connected again once', async (t) => {
  const w = await world(t);
  w.server.online = false;
  for (let i = 0; i < 3; i += 1) {
    w.clock.advance(MINUTE);
    await w.hub.refresh();
  }
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.equal(w.fake.connectionStatus.message.en, 'Grocy does not answer');
  const transports = w.fake.transports.flat().map((e) => e.transport);
  assert.deepEqual(transports, ['local', 'unreachable']);
  // The last values stay: an outage does not empty the fridge.
  assert.equal(w.fake.lastState(featureId(w.gladys, 'products_due_soon')), 3);
  w.server.online = true;
  w.clock.advance(MINUTE);
  await w.hub.refresh();
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
  assert.deepEqual(
    w.fake.transports.flat().map((e) => e.transport),
    ['local', 'unreachable', 'local'],
  );
});

test('a refused API key is said in the connection status', async (t) => {
  const w = await world(t, { config: baseConfig({ api_key: 'wrong' }) });
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.fr, /clé d'API refusée/);
});

test('no address, or an address that cannot be read', async (t) => {
  const empty = await world(t, { config: { language: 'en' } });
  assert.deepEqual(empty.fake.discoveredDevices, []);
  assert.match(empty.fake.connectionStatus.message.en, /Enter the address/);
  const bad = await world(t, { config: baseConfig({ grocy_url: 'http://user:pw@192.0.2.10' }) });
  assert.match(bad.fake.connectionStatus.message.en, /Address not understood/);
  const ack = await bad.fake.sceneAction('consume_product', { product: 'Milk', amount: 1 });
  assert.equal(ack.success, false);
  assert.match(ack.error, /not configured/);
});

test('a new configuration: another shopping list, another language', async (t) => {
  const w = await world(t);
  await w.fake.configUpdated(baseConfig({ shopping_list_id: 2, language: 'fr' }));
  assert.equal(w.fake.lastState(featureId(w.gladys, 'shopping_list_items')), 1);
  assert.equal(w.fake.discoveredDevices[0].features[0].name, 'Produits bientôt périmés');
});

// --- Scene triggers ----------------------------------------------------------------

test('what is already due at the first start is not announced', async (t) => {
  const w = await world(t);
  assert.deepEqual(w.fake.sceneEvents, []);
  w.clock.advance(MINUTE);
  await w.hub.refresh({ full: true });
  assert.deepEqual(w.fake.sceneEvents, []);
});

test('a product entering the due soon window, then passing its date', async (t) => {
  const w = await world(t);
  // The crème fraîche is due in 10 days: it enters the 5-day window on the 19th.
  w.clock.time = Date.UTC(2026, 9, 19, 8, 0, 0);
  await w.hub.refresh();
  const soon = w.fake.sceneEvents.filter((e) => e.key === TRIGGERS.PRODUCT_EXPIRING);
  const creme = soon.filter((e) => e.data.product === 'Crème fraîche');
  assert.deepEqual(
    creme.map((e) => e.data),
    [
      {
        product: 'Crème fraîche',
        status: 'due_soon',
        due_date: '2026-10-24',
        days_left: 5,
        amount: 1,
      },
    ],
  );
  // Its "use by" date passes: expired.
  w.clock.time = Date.UTC(2026, 9, 25, 8, 0, 0);
  await w.hub.refresh();
  const expired = w.fake.sceneEvents.filter(
    (e) => e.data.product === 'Crème fraîche' && e.data.status === 'expired',
  );
  assert.equal(expired.length, 1);
  assert.equal(expired[0].data.days_left, -1);
  // Announced once only.
  w.clock.advance(MINUTE);
  await w.hub.refresh({ full: true });
  assert.equal(
    w.fake.sceneEvents.filter((e) => e.data.product === 'Crème fraîche').length,
    creme.length + 1,
  );
});

test('a chore becoming overdue fires once, with who it is assigned to', async (t) => {
  const w = await world(t);
  w.clock.time = Date.UTC(2026, 9, 14, 16, 1, 0); // 18:01 in Paris
  await w.hub.refresh();
  await w.hub.refresh();
  const overdue = w.fake.sceneEvents.filter((e) => e.key === TRIGGERS.CHORE_OVERDUE);
  assert.deepEqual(
    overdue.map((e) => e.data),
    [{ chore: 'Water the plants', assigned_to: 'Demo User 2', due_time: '2026-10-14 18:00' }],
  );
});

test('the announced items survive a restart; a new Grocy starts from what is due', async (t) => {
  const dataDir = mkdtempSync(join(tmpdir(), 'gladys-grocy-'));
  const clock = createClock();
  const first = await createWorld({ clock, dataDir });
  clock.time = Date.UTC(2026, 9, 14, 16, 1, 0);
  await first.hub.refresh();
  assert.equal(first.fake.sceneEvents.length, 1);
  await first.app.stop();

  const second = await createWorld({ clock, dataDir });
  t.after(() => second.app.stop());
  assert.deepEqual(second.fake.sceneEvents, [], 'nothing announced twice after a restart');

  // Another Grocy (another address): what is due there is not "new".
  const elsewhere = 'http://192.0.2.40:9283';
  const third = await createWorld({
    clock,
    dataDir,
    config: baseConfig({ grocy_url: elsewhere }),
    servers: { [elsewhere]: new FakeGrocy({ now: clock.now }) },
  });
  t.after(() => third.app.stop());
  assert.deepEqual(third.fake.sceneEvents, []);
});

test('a burst of new products is announced over several cycles', async (t) => {
  const w = await world(t, { timings: { maxEventsPerCycle: 2 } });
  for (const stock of w.server.data.stock) {
    stock.best_before_date = '2026-10-16';
  }
  w.server.touch();
  w.clock.advance(MINUTE);
  await w.hub.refresh();
  assert.equal(w.fake.sceneEvents.length, 2);
  for (let i = 0; i < 5; i += 1) {
    await w.hub.refresh();
  }
  const keys = w.fake.sceneEvents.map((e) => `${e.data.product}|${e.data.status}`);
  assert.equal(new Set(keys).size, keys.length, 'no duplicate');
  // Chocolate, Gummy bears, Crisps, Cucumber, Tomato, Minced meat, Crème fraîche moved in,
  // and the milk has a new date.
  assert.equal(keys.length, 8);
});

test('an event refused by Gladys is announced again at the next cycle', async (t) => {
  const w = await world(t);
  const publish = w.gladys.publishSceneEvent.bind(w.gladys);
  let refuse = true;
  w.gladys.publishSceneEvent = async (...args) => {
    if (refuse) {
      throw new Error('HTTP 429');
    }
    return publish(...args);
  };
  w.clock.time = Date.UTC(2026, 9, 14, 16, 1, 0);
  await w.hub.refresh();
  assert.equal(w.fake.sceneEvents.length, 0);
  refuse = false;
  await w.hub.refresh();
  assert.equal(w.fake.sceneEvents.length, 1);
});

// --- Commands ------------------------------------------------------------------------

test('consume a product by name, by barcode, and refuse what is not in stock', async (t) => {
  const w = await world(t);
  assert.deepEqual(await w.hub.consumeProduct('milk', 1), {
    product: 'Milk',
    amount: 1,
    stock_left: 1,
  });
  assert.deepEqual(await w.hub.consumeProduct('42141099', '2'), {
    product: 'Crisps',
    amount: 2,
    stock_left: 23,
  });
  await assert.rejects(w.hub.consumeProduct('Milk', 5), /Not enough "Milk" in stock/);
  await assert.rejects(w.hub.consumeProduct('Bread', 1), /No product or barcode "Bread"/);
  await assert.rejects(w.hub.consumeProduct('tom', 1), /matches several names: Tomato, Sieved/);
  await assert.rejects(w.hub.consumeProduct('Milk', 0), /amount must be a number above 0/);
  await assert.rejects(w.hub.consumeProduct('  ', 1), /Enter a name/);
  // Inactive products are not offered.
  await assert.rejects(w.hub.consumeProduct('Apple juice', 1), /No product or barcode/);
  // The counters follow at once.
  assert.equal(w.server.data.stock.find((s) => s.product_id === 23).amount, 1);
});

test('a product created in Grocy a minute ago is found', async (t) => {
  const w = await world(t);
  w.server.data.products.push({ id: 30, name: 'Oat milk', due_type: 1, min_stock_amount: 0 });
  w.server.data.stock.push({ product_id: 30, amount: 2, best_before_date: '2026-12-01' });
  w.server.touch();
  w.clock.advance(10_000);
  assert.equal((await w.hub.consumeProduct('Oat milk', 1)).stock_left, 1);
});

test('add to the shopping list: a known product, or a line of text', async (t) => {
  const w = await world(t);
  assert.deepEqual(await w.hub.addToShoppingList('paprika', 2, 'red ones'), {
    item: 'Paprika',
    known_product: true,
    items_on_list: 4,
  });
  // "Tom" is not the exact name of a product: a line of text, never another product.
  assert.deepEqual(await w.hub.addToShoppingList('Tom', 1), {
    item: 'Tom',
    known_product: false,
    items_on_list: 5,
  });
  const lines = w.server.data.shopping.slice(-2);
  assert.deepEqual(
    lines.map((l) => [l.product_id, l.note, l.amount, l.shopping_list_id]),
    [
      [12, 'red ones', 2, 1],
      [null, 'Tom', 1, 1],
    ],
  );
});

test('mark a chore done and a battery charged, by name', async (t) => {
  const w = await world(t);
  assert.deepEqual(await w.hub.executeChore({ name: 'mop the kitchen' }), {
    chore: 'Mop the kitchen floor',
    next_time: '2026-10-21 23:59',
  });
  assert.equal(w.fake.lastState(featureId(w.gladys, 'chores_overdue')), 0);
  assert.deepEqual(await w.hub.chargeBattery({ name: 'Heat remote control' }), {
    battery: 'Heat remote control',
    next_charge: '2026-12-13 12:00',
  });
  assert.equal(w.fake.lastState(featureId(w.gladys, 'batteries_due')), 0);
  // A manual chore can be done; it has no next time.
  assert.deepEqual(await w.hub.executeChore({ name: 'Descale the kettle' }), {
    chore: 'Descale the kettle',
    next_time: '',
  });
  await assert.rejects(w.hub.executeChore({ name: 'Walk the dog' }), /No chore "Walk the dog"/);
  await assert.rejects(w.hub.chargeBattery({ name: 'Drone' }), /No battery "Drone"/);
});

test('an error of a command is said in the configured language', async (t) => {
  const w = await world(t, { config: baseConfig({ language: 'fr' }) });
  await assert.rejects(w.hub.consumeProduct('Pain', 1), /Aucun produit ni code-barres « Pain »/);
  w.server.online = false;
  await assert.rejects(w.hub.executeChore({ id: 2 }), /Grocy ne répond pas/);
});

test('the URL of the device never holds the API key', async (t) => {
  const w = await world(t);
  const [device] = w.fake.discoveredDevices;
  assert.deepEqual(device.params, [{ name: 'GROCY_URL', value: GROCY_URL.slice(7) }]);
});
