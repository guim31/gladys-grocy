// -----------------------------------------------------------------------------
// Grocy answers → snapshot, on the real answers of a Grocy 3.3.1 recorded by
// pygrocy (test/fixtures/grocy/pygrocy/, numbers as strings) and on the
// Grocy 4 shapes of the fake server (numbers as numbers).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSnapshot,
  counts,
  daysBetween,
  findByName,
  localStamp,
  normalizeName,
  num,
  parseBatteries,
  parseChores,
  parseShoppingList,
  parseTasks,
  parseUtcOffset,
  parseVersion,
  parseVolatile,
  productNames,
} from '../src/grocy/model.js';
import { FakeGrocy, fixture } from './helpers/fakeGrocy.js';

const real = (name) => fixture(`pygrocy/${name}`).body;

// The pygrocy recordings were made on 22 April 2022, in the morning.
const NOW = '2022-04-22 10:00:00';

function realSnapshot(now = NOW) {
  const names = productNames(real('objects-products'));
  return buildSnapshot(
    {
      volatile: parseVolatile(real('stock-volatile'), now.slice(0, 10)),
      chores: parseChores(real('chores')),
      batteries: parseBatteries(real('batteries'), [
        { id: '1', name: 'Battery1', charge_interval_days: '180', active: '1' },
        { id: '2', name: 'Battery2', charge_interval_days: '0', active: '1' },
        { id: '3', name: 'Battery3', charge_interval_days: '60', active: '1' },
        { id: '4', name: 'Battery4', charge_interval_days: '60', active: '0' },
      ]),
      tasks: parseTasks(real('tasks')),
      shopping: parseShoppingList(real('shopping-list'), 1, names),
    },
    now,
  );
}

test('numbers and flags are read from Grocy 3 strings and Grocy 4 numbers', () => {
  assert.equal(num('3.0'), 3);
  assert.equal(num(3), 3);
  assert.equal(num(''), null);
  assert.equal(num(null), null);
  assert.equal(num('abc'), null);
});

test('the version and the server zone come from /system/info and /system/time', () => {
  assert.equal(parseVersion(real('system-info')), '3.3.1');
  assert.equal(parseVersion({}), null);
  assert.equal(parseUtcOffset(real('system-time')), 0);
  assert.equal(
    parseUtcOffset({ time_local: '2026-10-14 12:00:01', time_utc: '2026-10-14 10:00:00' }),
    7200,
  );
  assert.equal(
    parseUtcOffset({ time_local: '2026-10-14 05:30:00', time_utc: '2026-10-14 10:00:00' }),
    -16200,
  );
  assert.equal(parseUtcOffset(null), null);
  assert.equal(localStamp(Date.UTC(2026, 9, 14, 22, 30), 7200), '2026-10-15 00:30:00');
});

test('the products of /stock/volatile, as the Grocy interface counts them (real answer)', () => {
  const volatile = parseVolatile(real('stock-volatile'), '2022-04-22');
  assert.deepEqual(
    volatile.dueSoon.map((p) => [p.name, p.date, p.daysLeft, p.amount]),
    [
      ['Milk', '2022-04-24', 2, 2],
      ['Paprika', '2022-04-24', 2, 5],
      ['Radish', '2022-04-24', 2, 5],
    ],
  );
  // Minced meat has a "use by" date (due_type 2): expired, not overdue.
  assert.deepEqual(
    volatile.overdue.map((p) => p.name),
    ['Crisps', 'Cucumber', 'Tomato'],
  );
  assert.deepEqual(
    volatile.expired.map((p) => [p.name, p.daysLeft]),
    [['Minced meat', -1]],
  );
  assert.deepEqual(
    volatile.missing.map((p) => [p.name, p.missing]),
    [
      ['Chocolate', 3],
      ['Cookies', 8],
      ['Gummy bears', 4],
    ],
  );
});

test('chores, tasks and batteries due today or late (real answers)', () => {
  const snapshot = realSnapshot();
  assert.deepEqual(
    snapshot.chores.overdue.map((c) => [c.name, c.next]),
    [['Mop the kitchen floor', '2022-04-18 23:59:59']],
  );
  // Tracked by date only: due at 23:59:59 of their day, never overdue on it.
  assert.deepEqual(
    snapshot.chores.dueToday.map((c) => [c.name, c.assignedTo]),
    [
      ['Clean the litter box', 'Demo User 4'],
      ['Take out the trash', 'Demo User'],
    ],
  );
  assert.deepEqual(
    snapshot.tasks.overdue.map((t) => t.name),
    ['Task2'],
  );
  assert.deepEqual(
    snapshot.tasks.dueToday.map((t) => t.name),
    ['Task3'],
  );
  // Battery3 is late, Battery1 due tonight; Battery2 has no interval, Battery4 is inactive.
  assert.deepEqual(
    snapshot.batteries.due.map((b) => [b.name, b.next]),
    [
      ['Battery3', '2022-04-17 09:38:06'],
      ['Battery1', '2022-04-22 23:59:59'],
    ],
  );
});

test('the shopping list names its items after their product or note (real answer)', () => {
  const names = productNames(real('objects-products'));
  const items = parseShoppingList(real('shopping-list'), 1, names);
  assert.deepEqual(
    items.slice(0, 3).map((i) => [i.name, i.amount, i.productId]),
    [
      ['Some good snacks', 1, null],
      ['Minced meat', 1, 20],
      ['Sieved tomatoes', 1, 17],
    ],
  );
  assert.ok(items.every((item) => item.name));
  assert.deepEqual(parseShoppingList(real('shopping-list'), 2, names), []);
});

test('the counts published on the device (real answers)', () => {
  assert.deepEqual(counts(realSnapshot()), {
    productsDueSoon: 3,
    productsOverdue: 3,
    productsExpired: 1,
    productsMissing: 3,
    shoppingItems: parseShoppingList(
      real('shopping-list'),
      1,
      productNames(real('objects-products')),
    ).length,
    choresDueToday: 2,
    choresOverdue: 1,
    batteriesDue: 2,
    tasksDueToday: 1,
    tasksOverdue: 1,
  });
});

test('a chore with a time is overdue once that time has passed', () => {
  const chores = parseChores([
    {
      chore_id: 9,
      chore_name: 'Feed the cat',
      next_estimated_execution_time: '2026-10-14 18:00:00',
    },
  ]);
  const at = (now) => buildSnapshot({ chores }, now).chores;
  assert.equal(at('2026-10-14 17:59:59').dueToday.length, 1);
  assert.equal(at('2026-10-14 18:00:01').overdue.length, 1);
  assert.equal(at('2026-10-13 18:00:01').dueToday.length, 0);
});

test('Grocy 4 answers (numbers, embedded battery) read like Grocy 3 ones', async () => {
  const now = Date.UTC(2026, 9, 14, 10, 0, 0);
  const grocy4 = new FakeGrocy({ now: () => now });
  const grocy3 = new FakeGrocy({ now: () => now, grocy3: true });
  const read = async (server) => {
    const get = async (path) =>
      JSON.parse(
        (
          await server.handle(`http://192.0.2.10/api${path}`, {
            headers: { 'GROCY-API-KEY': server.apiKey },
          })
        ).body,
      );
    const today = server.today();
    const names = productNames(await get('/objects/products'));
    return buildSnapshot(
      {
        volatile: parseVolatile(await get('/stock/volatile?due_soon_days=5'), today),
        chores: parseChores(await get('/chores')),
        batteries: parseBatteries(await get('/batteries'), await get('/objects/batteries')),
        tasks: parseTasks(await get('/tasks')),
        shopping: parseShoppingList(await get('/objects/shopping_list'), 1, names),
      },
      server.local(),
    );
  };
  const four = await read(grocy4);
  assert.deepEqual(await read(grocy3), four);
  assert.deepEqual(counts(four), {
    productsDueSoon: 3,
    productsOverdue: 3,
    productsExpired: 1,
    productsMissing: 3,
    shoppingItems: 3,
    choresDueToday: 3,
    choresOverdue: 1,
    batteriesDue: 1,
    tasksDueToday: 1,
    tasksOverdue: 1,
  });
});

test('days between two dates, across a month', () => {
  assert.equal(daysBetween('2026-10-30', '2026-11-02'), 3);
  assert.equal(daysBetween('2026-10-14', '2026-10-14'), 0);
  assert.equal(daysBetween('2026-10-14', '2026-10-13'), -1);
  assert.equal(daysBetween('2026-10-14', ''), null);
});

test('names typed in a scene: case, accents, and a unique part of a name', () => {
  const items = [
    { name: 'Crème fraîche' },
    { name: 'Tomato' },
    { name: 'Sieved tomatoes' },
    { name: 'Milk' },
  ];
  assert.equal(normalizeName('  Crème   FRAÎCHE '), 'creme fraiche');
  assert.deepEqual(findByName(items, 'creme fraiche'), {
    match: items[0],
    exact: true,
    candidates: [],
  });
  assert.deepEqual(findByName(items, 'tomato'), { match: items[1], exact: true, candidates: [] });
  assert.equal(findByName(items, 'mil').match, items[3]);
  assert.equal(findByName(items, 'mil').exact, false);
  assert.deepEqual(
    findByName(items, 'tom').candidates.map((i) => i.name),
    ['Tomato', 'Sieved tomatoes'],
  );
  assert.equal(findByName(items, '').match, null);
  assert.equal(findByName(items, 'bread').match, null);
});
