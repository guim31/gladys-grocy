// -----------------------------------------------------------------------------
// Optional test against a real Grocy: `npm run test:real` with GROCY_URL and
// GROCY_API_KEY set. Skipped otherwise (and in the CI).
//
// It drives the integration for real, through the SDK's fake Gladys: reads
// the instance, then runs the scene actions on throw-away objects it creates
// first (a product, a chore, a battery), so a real household is not touched —
// still, point it at a test instance (e.g. the grocy/grocy Docker image).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { parseGrocyUrl } from '../../src/config.js';
import { GrocyClient } from '../../src/grocy/client.js';
import { Store } from '../../src/store.js';

process.env.LOG_LEVEL ??= 'silent';

const url = process.env.GROCY_URL;
const apiKey = process.env.GROCY_API_KEY ?? '';
const skip = url ? false : 'set GROCY_URL (and GROCY_API_KEY) to run against a real Grocy';

test('a real Grocy: read, publish, act', { skip }, async (t) => {
  const client = new GrocyClient({ url: parseGrocyUrl(url), apiKey });
  const suffix = Date.now().toString(36);
  const created = async (entity, body) =>
    (await client.api('POST', `/objects/${entity}`, { json: body })).created_object_id;
  const productName = `Gladys test product ${suffix}`;
  const productId = await created('products', {
    name: productName,
    location_id: 1,
    qu_id_purchase: 1,
    qu_id_stock: 1,
    qu_id_consume: 1,
    qu_id_price: 1,
  });
  await client.api('POST', `/stock/products/${productId}/add`, {
    json: {
      amount: 3,
      best_before_date: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
    },
  });
  const choreName = `Gladys test chore ${suffix}`;
  await created('chores', { name: choreName, period_type: 'daily', period_interval: 1 });
  const batteryName = `Gladys test battery ${suffix}`;
  await created('batteries', { name: batteryName, charge_interval_days: 30 });
  t.after(async () => {
    // Inactive instead of deleted: nothing is ever deleted by this integration.
    await client
      .api('PUT', `/objects/products/${productId}`, { json: { active: 0 } })
      .catch(() => {});
  });

  const gladys = createFakeGladys({ config: { grocy_url: url, api_key: apiKey, language: 'en' } });
  const app = registerHandlers(gladys, {
    store: new Store(mkdtempSync(join(tmpdir(), 'gladys-grocy-real-'))),
    timers: false,
  });
  t.after(() => app.stop());
  await gladys.connect();
  await app.ready;

  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
  const [device] = gladys.fake.discoveredDevices;
  for (const feature of device.features) {
    assert.equal(typeof gladys.fake.lastState(feature.external_id), 'number', feature.name);
  }

  let ack = await gladys.fake.sceneAction('consume_product', { product: productName, amount: 1 });
  assert.equal(ack.success, true, ack.error);
  assert.equal(ack.data.outputs.stock_left, 2);
  ack = await gladys.fake.sceneAction('add_to_shopping_list', { item: productName, amount: 1 });
  assert.equal(ack.success, true, ack.error);
  assert.equal(ack.data.outputs.known_product, true);
  ack = await gladys.fake.sceneAction('execute_chore', { chore: choreName });
  assert.equal(ack.success, true, ack.error);
  assert.match(ack.data.outputs.next_time, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  ack = await gladys.fake.sceneAction('charge_battery', { battery: batteryName });
  assert.equal(ack.success, true, ack.error);
  for (const key of ['consume_soon', 'today', 'shopping_list']) {
    ack = await gladys.fake.widgetGet(key, { settings: {}, language: 'en' });
    assert.equal(ack.success, true, ack.error);
  }
});
