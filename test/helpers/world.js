// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake Grocy on a fake
// network, a temporary /data and a manual clock, with the integration wired on
// top through registerHandlers. No timer runs unless `timers: true` (with
// node:test mock timers): the tests read Grocy with `world.hub.refresh()`.
// (Adapted from guim31/gladys-pihole.)
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';
import { API_KEY, FakeGrocy, createNetwork } from './fakeGrocy.js';

// The integration logs every change; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

export const GROCY_URL = 'http://192.0.2.10:9283';

/** A manual clock, shared by the hub and the fake Grocy: 14 Oct 2026, 10:00 UTC (12:00 in Paris). */
export function createClock(start = Date.UTC(2026, 9, 14, 10, 0, 0)) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export const baseConfig = (extra = {}) => ({
  grocy_url: GROCY_URL,
  api_key: API_KEY,
  language: 'en',
  ...extra,
});

/**
 * @param {object} [options]
 * @param {Record<string, FakeGrocy>} [options.servers] by base URL
 * @param {object} [options.config] raw integration config
 * @param {Array} [options.devices] devices already created in Gladys
 * @param {boolean} [options.connect]
 * @param {object} [options.grocy] options of the default FakeGrocy
 */
export async function createWorld({
  clock = createClock(),
  grocy,
  servers,
  config = baseConfig(),
  devices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-grocy-')),
  timings = {},
  timers = false,
} = {}) {
  const server = new FakeGrocy({ now: clock.now, ...grocy });
  const network = createNetwork(servers ?? { [GROCY_URL]: server });
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    request: network.request,
    timers,
    timings,
    now: clock.now,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, network, server, app, hub: app.hub, clock, dataDir };
}

/** External id of the device, and of one of its features. */
export const deviceId = (gladys) => gladys.externalIds('grocy', '1').device;
export const featureId = (gladys, key) => gladys.externalIds('grocy', '1').feature(key);

/** Add the discovered device in Gladys, as the user would. */
export async function createAll(world) {
  for (const device of world.fake.discoveredDevices) {
    await world.fake.deviceCreated(device);
  }
}

export { API_KEY, FakeGrocy };
