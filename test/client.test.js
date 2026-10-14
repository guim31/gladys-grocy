// -----------------------------------------------------------------------------
// The Grocy client: the API key header, the errors a user can meet (no
// answer, certificate, refused key, redirect, not a Grocy), the 400 answers
// of Grocy with their message, a Grocy below a sub-directory.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_KINDS, GrocyClient, REJECTED, safeLocation } from '../src/grocy/client.js';
import { API_KEY, FakeGrocy, createNetwork, fixture } from './helpers/fakeGrocy.js';

const URL = 'http://192.0.2.10:9283';

function client({ server = new FakeGrocy(), url = URL, apiKey = API_KEY, request } = {}) {
  const network = createNetwork({ [url]: server });
  return { server, client: new GrocyClient({ url, apiKey, request: request ?? network.request }) };
}

test('every request carries the API key and asks for JSON', async () => {
  const seen = [];
  const { client: c } = client({
    request: async (url, options) => {
      seen.push({ url, options });
      return { status: 200, headers: {}, body: '{"changed_time":"2026-10-14 12:00:00"}' };
    },
  });
  assert.deepEqual(await c.getDbChangedTime(), { changed_time: '2026-10-14 12:00:00' });
  assert.equal(seen[0].url, `${URL}/api/system/db-changed-time`);
  assert.equal(seen[0].options.headers['GROCY-API-KEY'], API_KEY);
  await c.getVolatileStock(7);
  assert.equal(seen[1].url, `${URL}/api/stock/volatile?due_soon_days=7`);
});

test('no API key: no header (a Grocy with authentication disabled)', async () => {
  const { client: c } = client({ server: new FakeGrocy({ apiKey: '' }), apiKey: '' });
  assert.equal(typeof (await c.getSystemInfo()).grocy_version.Version, 'string');
});

test('a refused or missing API key is an authentication error', async () => {
  const { client: c } = client({ apiKey: 'wrong-key' });
  await assert.rejects(c.getChores(), { kind: ERROR_KINDS.AUTH, status: 401 });
  const { client: none } = client({ apiKey: '' });
  await assert.rejects(none.getChores(), { kind: ERROR_KINDS.AUTH });
});

test('a Grocy that does not answer, or a host that does not exist', async () => {
  const server = new FakeGrocy();
  server.online = false;
  const { client: c } = client({ server });
  await assert.rejects(c.getChores(), { kind: ERROR_KINDS.UNREACHABLE });
  const lost = new GrocyClient({
    url: 'http://198.51.100.99',
    request: createNetwork({}).request,
  });
  await assert.rejects(lost.getChores(), { kind: ERROR_KINDS.UNREACHABLE });
});

test('a self-signed certificate is a TLS error, not "unreachable"', async () => {
  const { client: c } = client({
    request: async () => {
      const error = new Error('self-signed certificate');
      error.code = 'DEPTH_ZERO_SELF_SIGNED_CERT';
      throw error;
    },
  });
  await assert.rejects(c.getChores(), { kind: ERROR_KINDS.TLS });
});

test('a redirect is reported with a safe location', async () => {
  const { client: c } = client({
    request: async () => ({
      status: 302,
      headers: { location: 'https://user:pass@grocy.example.com/login?token=abc' },
      body: '',
    }),
  });
  const err = await c.getChores().catch((e) => e);
  assert.equal(err.kind, ERROR_KINDS.REDIRECT);
  assert.equal(err.message, 'Redirected to https://grocy.example.com/login');
  assert.equal(safeLocation('/login?x=1'), '/login');
  assert.equal(safeLocation(undefined), '?');
});

test('a web page instead of the API is "not a Grocy"', async () => {
  const server = new FakeGrocy();
  // Grocy is below /grocy, the user typed the bare address.
  const network = createNetwork({ [`${URL}/grocy`]: server });
  const c = new GrocyClient({ url: URL, apiKey: API_KEY, request: network.request });
  await assert.rejects(c.getChores(), { kind: ERROR_KINDS.NOT_GROCY, status: 404 });
  const html = new GrocyClient({
    url: URL,
    request: async () => ({ status: 200, headers: {}, body: '<html>NAS login</html>' }),
  });
  await assert.rejects(html.getChores(), { kind: ERROR_KINDS.NOT_GROCY });
});

test('a Grocy below a sub-directory answers', async () => {
  const { client: c } = client({ url: `${URL}/grocy` });
  assert.ok(Array.isArray(await c.getChores()));
});

test('a 400 of Grocy is a refusal carrying its message (real answers)', async () => {
  for (const name of [
    'execute-chore-unknown',
    'consume-by-barcode-unknown',
    'complete-task-unknown',
    'product-by-barcode-unknown',
  ]) {
    const recorded = fixture(`pygrocy/${name}`);
    const c = new GrocyClient({
      url: URL,
      request: async () => ({
        status: recorded.status,
        headers: {},
        body: JSON.stringify(recorded.body),
      }),
    });
    const err = await c.api(recorded.method, recorded.path.replace(/^\/api/, '')).catch((e) => e);
    assert.equal(err.kind, REJECTED, name);
    assert.equal(err.grocyMessage, recorded.body.error_message, name);
  }
});

test('a 204 resolves with null, a 500 is an HTTP error', async () => {
  const { client: c, server } = client();
  assert.equal(await c.completeTask(3), null);
  server.failNext = 500;
  await assert.rejects(c.getChores(), { kind: ERROR_KINDS.HTTP, status: 500 });
});

test('the commands send what the Grocy API expects', async () => {
  const { client: c, server } = client();
  await c.consumeProduct(23, 1, { spoiled: true });
  await c.addProductToShoppingList(12, 2, 3, 'red ones');
  await c.addNoteToShoppingList(1, 'Bread', 1);
  await c.addMissingProductsToShoppingList(1);
  await c.executeChore(3);
  await c.chargeBattery(3);
  const posts = server.requests.filter((r) => r.method === 'POST');
  assert.deepEqual(
    posts.map((r) => [r.path, r.body]),
    [
      ['/stock/products/23/consume', { amount: 1, spoiled: true, transaction_type: 'consume' }],
      [
        '/stock/shoppinglist/add-product',
        { product_id: 12, list_id: 2, product_amount: 3, note: 'red ones' },
      ],
      ['/objects/shopping_list', { shopping_list_id: 1, note: 'Bread', amount: 1 }],
      ['/stock/shoppinglist/add-missing-products', { list_id: 1 }],
      ['/chores/3/execute', {}],
      ['/batteries/3/charge', {}],
    ],
  );
});
