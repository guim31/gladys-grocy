import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig, parseGrocyUrl } from '../src/config.js';

test('the address typed by the user becomes a base URL', () => {
  assert.equal(parseGrocyUrl('192.0.2.10:9283'), 'http://192.0.2.10:9283');
  assert.equal(parseGrocyUrl(' http://192.0.2.10:9283/ '), 'http://192.0.2.10:9283');
  assert.equal(parseGrocyUrl('https://grocy.example.com'), 'https://grocy.example.com');
  // A sub-directory is kept, the page the browser was on is not.
  assert.equal(parseGrocyUrl('https://nas.example.com/grocy/'), 'https://nas.example.com/grocy');
  assert.equal(
    parseGrocyUrl('https://nas.example.com/grocy/stockoverview'),
    'https://nas.example.com/grocy',
  );
  assert.equal(parseGrocyUrl('http://192.0.2.10:9283/api'), 'http://192.0.2.10:9283');
  assert.equal(parseGrocyUrl('http://192.0.2.10/shoppinglist?list=2'), 'http://192.0.2.10');
});

test('unusable addresses are refused, and credentials never kept', () => {
  for (const raw of ['', '   ', 'ftp://192.0.2.10', 'http://', 'http://user:pw@192.0.2.10', 42]) {
    assert.equal(parseGrocyUrl(raw), null, String(raw));
  }
});

test('the defaults apply to an empty configuration', () => {
  const config = normalizeConfig({});
  assert.deepEqual(config, {
    url: null,
    invalidUrl: false,
    apiKey: '',
    allowSelfSigned: false,
    dueSoonDays: DEFAULT_CONFIG.due_soon_days,
    shoppingListId: DEFAULT_CONFIG.shopping_list_id,
    pollIntervalMs: 60_000,
    language: 'fr',
  });
  assert.deepEqual(normalizeConfig(null).url, null);
});

test('every value is normalized', () => {
  const config = normalizeConfig({
    grocy_url: 'grocy.local:9283',
    api_key: ' abc123 ',
    allow_self_signed: 'true',
    due_soon_days: '7',
    shopping_list_id: 2.4,
    poll_interval: 300,
    language: 'de',
  });
  assert.equal(config.url, 'http://grocy.local:9283');
  assert.equal(config.apiKey, 'abc123');
  assert.equal(config.allowSelfSigned, true);
  assert.equal(config.dueSoonDays, 7);
  assert.equal(config.shoppingListId, 2);
  assert.equal(config.pollIntervalMs, 300_000);
  assert.equal(config.language, 'de');
});

test('out-of-range values fall back or are clamped', () => {
  const config = normalizeConfig({
    grocy_url: 'not a url at all :::',
    due_soon_days: 400,
    shopping_list_id: 'x',
    poll_interval: '7',
    language: 'it',
  });
  assert.equal(config.url, null);
  assert.equal(config.invalidUrl, true);
  assert.equal(config.dueSoonDays, 30);
  assert.equal(config.shoppingListId, 1);
  assert.equal(config.pollIntervalMs, 60_000);
  assert.equal(config.language, 'fr');
});
