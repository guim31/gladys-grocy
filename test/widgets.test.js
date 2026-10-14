// -----------------------------------------------------------------------------
// The three widgets: rendered exactly as sent (validateWidgetContent of the
// SDK: vocabulary, budget, lengths), in every language and every state, and
// their buttons.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { WIDGET_KEYS } from '../src/hub.js';
import { ACTIONS, relativeDay, todayRows } from '../src/widgets.js';
import { baseConfig, createWorld, featureId } from './helpers/world.js';

const LANGUAGES = ['en', 'fr', 'de', 'es'];

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

async function content(w, key, language = 'en') {
  const ack = await w.fake.widgetGet(key, { settings: {}, language });
  assert.equal(ack.success, true, ack.error);
  return ack.data.content ?? ack.data;
}

const byType = (c, type) => c.components.filter((component) => component.type === type);

test('every widget fits the core vocabulary and budget, in every language', async (t) => {
  const w = await world(t);
  // More rows than a card list holds.
  for (let i = 0; i < 10; i += 1) {
    w.server.data.shopping.push({
      id: 100 + i,
      shopping_list_id: 1,
      product_id: null,
      note: `A rather long free-text item number ${i} that goes on and on and on and on`,
      amount: 1.5,
      done: 0,
    });
  }
  w.server.touch();
  await w.hub.refresh({ full: true });
  for (const key of Object.values(WIDGET_KEYS)) {
    for (const language of LANGUAGES) {
      const c = await content(w, key, language);
      assert.deepEqual(validateWidgetContent(c), [], `${key} (${language})`);
    }
  }
});

test('every widget states fit too: not configured, waiting, error, empty', async (t) => {
  const states = [];
  const unconfigured = await world(t, { config: { language: 'en' } });
  states.push(unconfigured);
  const down = await world(t);
  down.server.online = false;
  down.clock.advance(60_000);
  await down.hub.refresh();
  states.push(down);
  const empty = await world(t);
  empty.server.data.stock = [];
  empty.server.data.chores = [];
  empty.server.data.tasks = [];
  empty.server.data.batteries = [];
  empty.server.data.shopping = [];
  empty.server.touch();
  await empty.hub.refresh({ full: true });
  states.push(empty);
  for (const w of states) {
    for (const key of Object.values(WIDGET_KEYS)) {
      for (const language of LANGUAGES) {
        const c = await content(w, key, language);
        assert.deepEqual(validateWidgetContent(c), [], `${key} (${language})`);
        assert.ok(c.components.length > 0);
      }
    }
  }
  assert.match(byType(await content(down, 'today'), 'text')[0].text, /Grocy does not answer/);
  assert.match(byType(await content(empty, 'today', 'fr'), 'text')[0].text, /Plus rien à faire/);
});

test('"Eat first": expired, then past best-before, then due soon', async (t) => {
  const w = await world(t);
  const c = await content(w, WIDGET_KEYS.CONSUME_SOON, 'fr');
  const [list] = byType(c, 'card-list');
  assert.deepEqual(
    list.items.map((item) => [item.title, item.badge.text]),
    [
      ['Minced meat', 'Périmé'],
      ['Crisps', 'En retard'],
      ['Cucumber', 'En retard'],
      ['Tomato', 'En retard'],
      ['Milk', "Aujourd'hui"],
      ['Paprika', 'Dans 2 j'],
      ['Radish', 'Dans 2 j'],
    ],
  );
  assert.deepEqual(
    byType(c, 'value').map((v) => v.value),
    [4, 3],
  );
});

test('"To do today": the late ones first, a Done button for the first four', async (t) => {
  const w = await world(t);
  const c = await content(w, WIDGET_KEYS.TODAY);
  const [list] = byType(c, 'card-list');
  assert.deepEqual(
    list.items.map((item) => [item.title, item.badge.text]),
    [
      ['Mop the kitchen floor', 'Overdue'],
      ['Fix the bike', 'Overdue'],
      ['Water the plants', 'Today'],
      ['Clean the litter box', 'Today'],
      ['Take out the trash', 'Today'],
      ['Call the plumber', 'Today'],
      ['Heat remote control', 'Overdue'],
    ],
  );
  const buttons = byType(c, 'button');
  assert.deepEqual(
    buttons.map((b) => [b.action.key, b.action.params]),
    [
      ['done_1', { kind: 'chore', id: 2 }],
      ['done_2', { kind: 'task', id: 2 }],
      ['done_3', { kind: 'chore', id: 6 }],
      ['done_4', { kind: 'chore', id: 5 }],
    ],
  );
  // Never the style to tell a state (invisible in dark mode).
  assert.ok(buttons.every((b) => b.style === 'secondary'));
});

test('tapping Done tracks the chore, completes the task, charges the battery', async (t) => {
  const w = await world(t);
  const tap = (actionKey, params) =>
    w.fake.widgetAction(WIDGET_KEYS.TODAY, actionKey, params, { settings: {} });
  let ack = await tap('done_1', { kind: 'chore', id: 2 });
  assert.equal(ack.success, true, ack.error);
  assert.equal(ack.data.message.fr, 'Tâche ménagère « Mop the kitchen floor » faite.');
  ack = await tap('done_2', { kind: 'task', id: 2 });
  assert.equal(ack.data.message.en, 'Task "Fix the bike" completed.');
  ack = await tap('done_3', { kind: 'battery', id: 3 });
  assert.equal(ack.data.message.de, 'Batterie „Heat remote control“ geladen.');
  assert.equal(w.fake.lastState(featureId(w.gladys, 'chores_overdue')), 0);
  assert.equal(w.fake.lastState(featureId(w.gladys, 'tasks_overdue')), 0);
  assert.equal(w.fake.lastState(featureId(w.gladys, 'batteries_due')), 0);
  // The same tap again: the item is gone from Grocy's list.
  ack = await tap('done_2', { kind: 'task', id: 2 });
  assert.equal(ack.success, false);
  assert.match(ack.error, /no longer due/);
  ack = await tap('unknown', {});
  assert.equal(ack.success, false);
});

test('"Shopping list": items, missing products, and the Add… form', async (t) => {
  const w = await world(t);
  const c = await content(w, WIDGET_KEYS.SHOPPING);
  assert.deepEqual(
    byType(c, 'card-list')[0].items.map((item) => item.title),
    ['Some good snacks', 'Minced meat', 'Sieved tomatoes'],
  );
  const [missing, add] = byType(c, 'button');
  assert.equal(missing.action.key, ACTIONS.ADD_MISSING);
  assert.deepEqual(
    add.action.fields.map((f) => f.key),
    ['item', 'amount'],
  );

  let ack = await w.fake.widgetAction(
    WIDGET_KEYS.SHOPPING,
    ACTIONS.ADD_MISSING,
    {},
    {
      settings: {},
    },
  );
  assert.equal(ack.success, true, ack.error);
  // Cookies, Chocolate and Gummy bears are below their minimum.
  assert.equal(ack.data.message.en, '3 product(s) added to the shopping list.');

  ack = await w.fake.widgetAction(
    WIDGET_KEYS.SHOPPING,
    ACTIONS.ADD_ITEM,
    {},
    {
      settings: {},
      values: { item: 'Eggs', amount: 6 },
    },
  );
  assert.equal(ack.success, true, ack.error);
  assert.equal(ack.data.message.fr, '« Eggs » ajouté à la liste de courses.');
  assert.equal(w.fake.lastState(featureId(w.gladys, 'shopping_list_items')), 7);
});

test('an older Gladys relays the Add… tap without the form: the user is told why', async (t) => {
  const w = await world(t, { config: baseConfig({ language: 'fr' }) });
  const ack = await w.fake.widgetAction(
    WIDGET_KEYS.SHOPPING,
    ACTIONS.ADD_ITEM,
    {},
    {
      settings: {},
    },
  );
  assert.equal(ack.success, false);
  assert.match(ack.error, /Mettez Gladys à jour \(5\.2\.0/);
});

test('relative days', () => {
  assert.equal(relativeDay(0, 'fr'), "Aujourd'hui");
  assert.equal(relativeDay(1, 'de'), 'Morgen');
  assert.equal(relativeDay(4, 'es'), 'En 4 d');
  assert.equal(relativeDay(-3, 'en'), '3 d ago');
});

test('the rows of "today" mark a battery late once its time has passed', () => {
  const rows = todayRows({
    now: '2026-10-14 12:00:00',
    chores: { overdue: [], dueToday: [] },
    tasks: { overdue: [], dueToday: [] },
    batteries: {
      due: [
        { id: 1, name: 'A', next: '2026-10-14 08:00:00' },
        { id: 2, name: 'B', next: '2026-10-14 20:00:00' },
      ],
    },
  });
  assert.deepEqual(
    rows.map((r) => [r.name, r.late]),
    [
      ['A', true],
      ['B', false],
    ],
  );
});
