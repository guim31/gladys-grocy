// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// (Adapted from guim31/gladys-pihole.)
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_CONFIG, DUE_SOON_DAYS, LANGUAGES, POLL_INTERVALS } from '../src/config.js';
import { PRODUCT_STATUS } from '../src/grocy/model.js';
import { TRIGGERS, WIDGET_KEYS } from '../src/hub.js';
import { SCENE_ACTIONS } from '../src/scenes.js';
import { WIDGETS } from '../src/widgets.js';
import { createWorld } from './helpers/world.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// Every list of form fields the manifest can declare (same field grammar).
const allFields = [
  ...(manifest.config_schema ?? []),
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

const CAPABILITY_FIELDS = ['scene_triggers', 'scene_actions', 'widgets'];
// The "Add…" button of the shopping list widget opens a form (Gladys#3168): 5.2.0.
const MIN_GLADYS_VERSION = [5, 2, 0];
const CATEGORIES_MIN_GLADYS_VERSION = [4, 86, 0];

const keysOf = (list) => (list ?? []).map((entry) => entry.key);

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

function isAtLeast(version, required) {
  for (let i = 0; i < required.length; i += 1) {
    if (version[i] !== required[i]) {
      return version[i] > required[i];
    }
  }
  return true;
}

test('identity: name, image, cover, local transport, services category', () => {
  assert.equal(manifest.name, 'Grocy');
  assert.equal(manifest.type, 'device');
  assert.match(manifest.docker_image, /^ghcr\.io\/guim31\/gladys-grocy:/);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/guim31/gladys-grocy/main/cover.png',
  );
  assert.deepEqual(manifest.transports, ['local']);
  assert.deepEqual(manifest.categories, ['services']);
  assert.equal(manifest.network_discovery, undefined);
});

test('every manifest action has a handler', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  for (const action of manifest.actions) {
    const ack = await world.fake.action(action.key, {});
    assert.equal(ack.success, true, `${action.key}: ${ack.error}`);
  }
  assert.deepEqual(keysOf(manifest.actions), ['test_connection']);
});

test('declaring catalog categories requires Gladys >= 4.86.0', () => {
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  assert.ok(isAtLeast(minGladysVersion(), CATEGORIES_MIN_GLADYS_VERSION));
});

test('scene triggers, scene actions, widgets and a widget form require Gladys >= 5.2.0', () => {
  const declared = CAPABILITY_FIELDS.filter((field) => manifest[field] !== undefined);
  assert.deepEqual(declared, CAPABILITY_FIELDS);
  assert.ok(isAtLeast(minGladysVersion(), MIN_GLADYS_VERSION));
});

const SCENE_FIELDS = {
  consume_product: { product: 'Milk', amount: 1, spoiled: false },
  add_to_shopping_list: { item: 'Bread', amount: 1 },
  execute_chore: { chore: 'Take out the trash' },
  charge_battery: { battery: 'Heat remote control' },
};

test('every scene_actions key has a handler, and returns the declared outputs', async (t) => {
  assert.deepEqual(keysOf(manifest.scene_actions).sort(), Object.keys(SCENE_ACTIONS).sort());
  const world = await createWorld();
  t.after(() => world.app.stop());
  for (const action of manifest.scene_actions) {
    const ack = await world.fake.sceneAction(action.key, SCENE_FIELDS[action.key]);
    assert.equal(ack.success, true, `${action.key}: ${ack.error}`);
    assert.deepEqual(
      Object.keys(ack.data.outputs).sort(),
      keysOf(action.outputs).sort(),
      `${action.key} outputs`,
    );
    for (const output of action.outputs) {
      assert.equal(
        typeof ack.data.outputs[output.key],
        output.type,
        `${action.key}.${output.key} is a ${output.type}`,
      );
    }
    // Every field the handler reads is declared.
    assert.deepEqual(
      Object.keys(SCENE_FIELDS[action.key]).filter((key) => !keysOf(action.fields).includes(key)),
      [],
    );
  }
});

test('the scene triggers are the ones the hub fires, with their filters and variables', async (t) => {
  assert.deepEqual(keysOf(manifest.scene_triggers).sort(), Object.values(TRIGGERS).sort());
  const world = await createWorld();
  t.after(() => world.app.stop());
  // A product enters the window, another passes its date, a chore gets late.
  world.clock.time = Date.UTC(2026, 9, 19, 17, 0, 0);
  await world.hub.refresh();
  const fired = new Map(world.fake.sceneEvents.map((event) => [event.key, event.data]));
  for (const trigger of manifest.scene_triggers) {
    const data = fired.get(trigger.key);
    assert.ok(data, `${trigger.key} was fired`);
    // Filters match keys of `data`, variables read keys of `data`.
    for (const key of [...keysOf(trigger.fields), ...keysOf(trigger.variables)]) {
      assert.ok(key in data, `${trigger.key}: "${key}" is in the event data`);
    }
    for (const key of Object.keys(data)) {
      assert.ok(
        keysOf(trigger.variables).includes(key) || keysOf(trigger.fields).includes(key),
        `${trigger.key}: "${key}" is declared`,
      );
    }
    for (const variable of trigger.variables) {
      assert.equal(typeof data[variable.key], variable.type, `${trigger.key}.${variable.key}`);
    }
    // A boolean filter cannot express "any": not allowed on triggers.
    assert.ok(trigger.fields.every((field) => field.type !== 'boolean'));
  }
  const status = manifest.scene_triggers
    .find((trigger) => trigger.key === TRIGGERS.PRODUCT_EXPIRING)
    .fields.find((field) => field.key === 'status');
  assert.deepEqual(
    status.options.map((option) => option.value),
    Object.values(PRODUCT_STATUS),
  );
});

test('every widgets key has a handler', async (t) => {
  assert.deepEqual(keysOf(manifest.widgets), Object.values(WIDGET_KEYS));
  assert.deepEqual(Object.keys(WIDGETS), Object.values(WIDGET_KEYS));
  const world = await createWorld();
  t.after(() => world.app.stop());
  for (const key of Object.values(WIDGET_KEYS)) {
    const ack = await world.fake.widgetGet(key, { settings: {} });
    assert.equal(ack.success, true, ack.error);
  }
  // A widget with buttons declares how long its actions may take.
  for (const widget of manifest.widgets) {
    assert.equal(
      widget.action_timeout_seconds !== undefined,
      typeof WIDGETS[widget.key].action === 'function',
      widget.key,
    );
  }
});

test('config_schema defaults and options stay consistent with the code', () => {
  for (const field of manifest.config_schema) {
    if (field.default !== undefined) {
      assert.equal(
        DEFAULT_CONFIG[field.key],
        field.default,
        `DEFAULT_CONFIG.${field.key} must match the manifest default`,
      );
    }
  }
  const field = (key) => manifest.config_schema.find((f) => f.key === key);
  assert.deepEqual(
    field('language').options.map((o) => o.value),
    LANGUAGES,
  );
  assert.deepEqual(
    field('poll_interval').options.map((o) => o.value),
    POLL_INTERVALS,
  );
  assert.equal(field('due_soon_days').min, DUE_SOON_DAYS.min);
  assert.equal(field('due_soon_days').max, DUE_SOON_DAYS.max);
  assert.deepEqual(
    Object.keys(DEFAULT_CONFIG).sort(),
    manifest.config_schema
      .filter((f) => f.type !== 'section')
      .map((f) => f.key)
      .sort(),
  );
  assert.equal(field('api_key').type, 'secret', 'the API key is a secret field');
});

test('section fields are purely presentational', () => {
  const sections = manifest.config_schema.filter((f) => f.type === 'section');
  assert.ok(sections.length > 0);
  for (const section of sections) {
    assert.equal(section.required, undefined);
    assert.equal(section.default, undefined);
    assert.equal(section.placeholder, undefined);
    assert.ok(!(section.key in DEFAULT_CONFIG));
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//, 'section links must be https');
    }
  }
});

test('number fields have integer bounds and defaults (the form has no step)', () => {
  for (const field of allFields.filter((f) => f.type === 'number')) {
    for (const key of ['min', 'max', 'default']) {
      if (field[key] !== undefined) {
        assert.ok(Number.isInteger(field[key]), `field "${field.key}".${key} must be an integer`);
      }
    }
  }
});

test('actions declare no secret field, no required field (no default is applied)', () => {
  // Gladys#3154/#3155: a secret in an action form cannot be filled, and an
  // action applies no default while enforcing `required`.
  for (const action of manifest.actions ?? []) {
    for (const field of action.fields ?? []) {
      assert.notEqual(field.type, 'secret');
      assert.notEqual(field.required, true);
    }
  }
});

test('scene fields: no secret, no dynamic source (Grocy names are typed)', () => {
  for (const item of [...manifest.scene_triggers, ...manifest.scene_actions]) {
    for (const field of item.fields ?? []) {
      assert.notEqual(field.type, 'secret', `${item.key}.${field.key}`);
      assert.equal(field.source, undefined, `${item.key}.${field.key}: no dynamic source`);
    }
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version, 'manifest version must match package.json');
  assert.ok(manifest.docker_image.endsWith(`:${manifest.version}`));
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(
      text.length >= 10 && text.length <= 100,
      `description.${lang} has ${text.length} characters (10 to 100 allowed)`,
    );
  }
});
