// -----------------------------------------------------------------------------
// The reading timer of the container. Gladys 5.2 never polls a device
// published with should_poll: false (and does not reliably poll the devices of
// external integrations, GladysAssistant/Gladys#3198): Grocy must be read by
// the hub's own timer, with no onPoll at all.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseConfig, createAll, createClock, createWorld, featureId } from './helpers/world.js';

/** Let the timer callback and the fake network settle. */
const settle = async () => {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

test('the internal timer refreshes the states without any onPoll from Gladys', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const clock = createClock();
  const w = await createWorld({ clock, config: baseConfig({ poll_interval: '60' }), timers: true });
  t.after(() => w.app.stop());
  const polled = t.mock.method(w.hub, 'pollDevice');
  await createAll(w);

  const device = w.fake.discoveredDevices[0];
  assert.equal(device.should_poll, false, 'Gladys is not asked to poll');
  const milk = w.server.data.stock.find((s) => s.product_id === 23);
  const before = w.server.requests.length;

  for (const [amount, dueSoon] of [
    [0, 2],
    [3, 3],
  ]) {
    milk.amount = amount;
    clock.advance(60_000);
    w.server.touch();
    t.mock.timers.tick(60_000);
    await settle();
    assert.equal(w.fake.lastState(featureId(w.gladys, 'products_due_soon')), dueSoon);
  }
  // Time alone (no change in Grocy): the plants are due at 18:00 in Paris.
  clock.time = Date.UTC(2026, 9, 14, 16, 1, 0);
  t.mock.timers.tick(60_000);
  await settle();
  assert.equal(w.fake.lastState(featureId(w.gladys, 'chores_overdue')), 2);

  assert.ok(w.server.requests.length > before);
  assert.equal(polled.mock.callCount(), 0, 'no onPoll involved');
});

test('onPoll still works as a fallback', async (t) => {
  const w = await createWorld();
  t.after(() => w.app.stop());
  const before = w.server.requests.length;
  const ack = await w.fake.poll(w.fake.discoveredDevices[0]);
  assert.equal(ack.success, true);
  assert.ok(w.server.requests.length > before);
});

test('the timer stops with the integration', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const w = await createWorld({ timers: true });
  await w.app.stop();
  const before = w.server.requests.length;
  t.mock.timers.tick(10 * 60_000);
  await settle();
  assert.equal(w.server.requests.length, before);
});
