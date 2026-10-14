// -----------------------------------------------------------------------------
// What the integration writes at the default level (info): the lifecycle
// only. A normal reading writes nothing, a failure that repeats is logged
// once, and its end once. Never the API key, at any level.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { API_KEY, baseConfig, createWorld } from './helpers/world.js';

/** Capture the lines of the SDK logger at the given level. */
function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  const lines = [];
  const record =
    (stream) =>
    (...args) =>
      lines.push({
        stream,
        text: args.map((arg) => (arg instanceof Error ? arg.stack : String(arg))).join(' '),
      });
  t.mock.method(console, 'log', record('out'));
  t.mock.method(console, 'error', record('err'));
  t.mock.method(console, 'warn', record('err'));
  t.mock.method(console, 'info', record('out'));
  t.mock.method(console, 'debug', record('out'));
  return {
    lines,
    clear: () => lines.splice(0),
    texts: () => lines.map((line) => line.text),
  };
}

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

test('a normal reading cycle writes nothing at info', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  assert.ok(
    logs.texts().some((text) => /Grocy 4\.7\.1 connected/.test(text)),
    'the start is logged',
  );
  logs.clear();

  for (let i = 0; i < 5; i += 1) {
    w.server.data.stock.find((s) => s.product_id === 23).amount += 1;
    w.server.touch();
    w.clock.advance(20 * 60_000); // a full reading too
    await w.hub.refresh();
  }
  // Scene events, states, widget refreshes: nothing at info.
  w.clock.time = Date.UTC(2026, 9, 14, 16, 1, 0);
  await w.hub.refresh();
  assert.ok(w.fake.sceneEvents.length > 0);
  assert.deepEqual(logs.texts(), []);
});

test('Grocy down is logged once, and once when it is back', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  logs.clear();

  w.server.online = false;
  for (let i = 0; i < 6; i += 1) {
    w.clock.advance(60_000);
    await w.hub.refresh();
  }
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.equal(logs.lines[0].stream, 'err');

  logs.clear();
  w.server.online = true;
  w.clock.advance(60_000);
  await w.hub.refresh();
  await w.hub.refresh();
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.match(logs.lines[0].text, /answers again after 6 min/);
});

test('Gladys refusing the states is logged once', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  logs.clear();
  w.gladys.publishChangedStates = async () => {
    throw new Error('HTTP 500');
  };
  for (let i = 0; i < 4; i += 1) {
    w.server.data.stock.find((s) => s.product_id === 23).amount = i;
    w.server.touch();
    w.clock.advance(60_000);
    await w.hub.refresh({ full: true });
  }
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.match(logs.lines[0].text, /States refused/);
});

test('one line per user action', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  logs.clear();
  await w.fake.sceneAction('consume_product', { product: 'Milk', amount: 1 });
  await w.fake.sceneAction('execute_chore', { chore: 'Mop the kitchen floor' });
  assert.deepEqual(
    logs.texts().map((text) => text.replace(/^.*\] /, '')),
    ['Consumed 1 × Milk', 'Chore "Mop the kitchen floor" done'],
  );
});

test('the API key never appears in the logs, even at debug and on errors', async (t) => {
  const logs = captureLogs(t, 'debug');
  const w = await world(t);
  await w.fake.sceneAction('consume_product', { product: 'Bread', amount: 1 });
  w.server.online = false;
  await w.hub.refresh();
  w.server.online = true;
  await w.fake.configUpdated(baseConfig({ api_key: 'another-secret-key-987' }));
  await w.hub.refresh();
  const text = logs.texts().join('\n');
  assert.ok(text.length > 0);
  assert.match(text, /\[DEBUG\]/);
  assert.ok(!text.includes(API_KEY), 'never the API key');
  assert.ok(!text.includes('another-secret-key-987'), 'never the refused API key');
});
