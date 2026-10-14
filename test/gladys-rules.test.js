// -----------------------------------------------------------------------------
// Conformity with the Gladys core, on every device discovered from realistic
// fixtures (the Grocy demo household, Grocy 4 and Grocy 3 answers): in every
// feature-name language, below a sub-directory, after a first reading.
//
// The table (test/fixtures/gladys-feature-table.json) is extracted from the
// core code: a category/type couple missing there shows as "undefined" or
// without icon in Gladys, a poll frequency outside its list is a 400 on
// discovery, a feature without min/max is a 422 on "Add to Gladys".
// Do not loosen this test to make it pass: fix the integration.
// (Adapted from guim31/gladys-wled, via guim31/gladys-pihole.)
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FakeGrocy, GROCY_URL, baseConfig, createWorld } from './helpers/world.js';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);

const SUBDIR_URL = 'https://192.0.2.20/grocy';

const scenarios = [
  { label: 'Grocy 4, English names', config: baseConfig() },
  { label: 'Grocy 3, English names', config: baseConfig(), grocy: { grocy3: true } },
  { label: 'French names', config: baseConfig({ language: 'fr' }) },
  { label: 'German names', config: baseConfig({ language: 'de' }) },
  { label: 'Spanish names', config: baseConfig({ language: 'es' }) },
  {
    label: 'Grocy below a sub-directory, over HTTPS',
    config: baseConfig({ grocy_url: `${SUBDIR_URL}/`, allow_self_signed: true }),
    subdir: true,
  },
];

for (const scenario of scenarios) {
  test(`every discovered device follows the Gladys rules (${scenario.label})`, async () => {
    const options = { config: scenario.config, grocy: scenario.grocy };
    if (scenario.subdir) {
      options.servers = { [SUBDIR_URL]: new FakeGrocy() };
    }
    const { gladys, app } = await createWorld(options);
    try {
      const devices = gladys.fake.discoveredDevices;
      assert.equal(devices.length, 1, 'one device per Grocy instance');
      assert.deepEqual(gladys.fake.connectionStatus, { connected: true });

      for (const device of devices) {
        const where = device.name;

        // should_poll: true if and only if poll_frequency is provided, in ms.
        if (device.poll_frequency === undefined) {
          assert.notEqual(device.should_poll, true, `${where}: should_poll without poll_frequency`);
        } else {
          assert.equal(device.should_poll, true, `${where}: poll_frequency without should_poll`);
          assert.ok(
            table.poll_frequencies_ms.includes(device.poll_frequency),
            `${where}: poll_frequency ${device.poll_frequency} is not one of ${table.poll_frequencies_ms}`,
          );
        }
        // The address never ends up in the params with credentials.
        for (const param of device.params ?? []) {
          assert.ok(!/@|api_key|GROCY-API-KEY/i.test(param.value), `${where}: ${param.name}`);
        }

        assert.ok(device.features.length > 0, `${where}: no feature`);
        const externalIds = new Set();
        const names = new Set();
        for (const feature of device.features) {
          const at = `${where} / ${feature.name}`;
          const pair = table.pairs[`${feature.category}/${feature.type}`];
          assert.ok(
            pair,
            `${at}: ${feature.category}/${feature.type} is not a couple Gladys knows`,
          );
          assert.ok(
            pair.label_en && pair.label_fr && pair.icon,
            `${at}: couple without label or icon`,
          );

          assert.equal(typeof feature.min, 'number', `${at}: min must be a number`);
          assert.equal(typeof feature.max, 'number', `${at}: max must be a number`);
          assert.ok(
            Number.isFinite(feature.min) && Number.isFinite(feature.max),
            `${at}: finite min/max`,
          );
          assert.ok(feature.min <= feature.max, `${at}: min > max`);
          assert.equal(typeof feature.read_only, 'boolean', `${at}: read_only must be a boolean`);
          assert.equal(
            typeof feature.has_feedback,
            'boolean',
            `${at}: has_feedback must be a boolean`,
          );
          if (feature.unit !== undefined) {
            assert.ok(table.units.includes(feature.unit), `${at}: unknown unit ${feature.unit}`);
          }

          assert.ok(!externalIds.has(feature.external_id), `${at}: duplicate external_id`);
          externalIds.add(feature.external_id);
          assert.ok(!names.has(feature.name), `${at}: duplicate feature name on the device`);
          names.add(feature.name);
          assert.ok(feature.name.length <= 40, `${at}: name longer than 40 characters`);

          // The value read from the fixtures fits the declared bounds.
          const value = gladys.fake.lastState(feature.external_id);
          assert.equal(typeof value, 'number', `${at}: no state published`);
          assert.ok(value >= feature.min && value <= feature.max, `${at}: ${value} out of bounds`);
          if (feature.type === 'integer' || feature.type === 'binary') {
            assert.ok(Number.isInteger(value), `${at}: ${value} is not an integer`);
          }
        }
      }
    } finally {
      await app.stop();
    }
  });
}

test('the device is identified by the instance, not by the address', async () => {
  const first = await createWorld();
  const second = await createWorld({
    config: baseConfig({ grocy_url: GROCY_URL.replace('http://', 'https://') }),
    servers: { [GROCY_URL.replace('http://', 'https://')]: new FakeGrocy() },
  });
  try {
    assert.equal(
      first.fake.discoveredDevices[0].external_id,
      second.fake.discoveredDevices[0].external_id,
    );
  } finally {
    await first.app.stop();
    await second.app.stop();
  }
});
