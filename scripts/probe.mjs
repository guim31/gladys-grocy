#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Read-only probe of a real Grocy, with the integration's own client and model:
// checks that every endpoint the integration reads answers as expected, and
// prints what the Gladys device would show. It only reads (GET): nothing is
// consumed, tracked or added.
//
//   GROCY_URL=http://192.0.2.10:9283 GROCY_API_KEY=... node scripts/probe.mjs
//   ... node scripts/probe.mjs --insecure          (self-signed certificate)
//   ... node scripts/probe.mjs --save /tmp/grocy   (save the answers, names masked)
//
// Never prints the API key. The saved answers have every product, chore,
// battery, task, user and note name replaced by "<kind> <id>": review them
// before committing them as fixtures anyway.
// -----------------------------------------------------------------------------

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseGrocyUrl } from '../src/config.js';
import { GrocyClient } from '../src/grocy/client.js';
import {
  buildSnapshot,
  counts,
  localStamp,
  parseBatteries,
  parseChores,
  parseShoppingList,
  parseTasks,
  parseUtcOffset,
  parseVersion,
  parseVolatile,
  productNames,
} from '../src/grocy/model.js';

const args = process.argv.slice(2);
const url = parseGrocyUrl(process.env.GROCY_URL ?? '');
const apiKey = process.env.GROCY_API_KEY ?? '';
const saveDir = args.includes('--save') ? args[args.indexOf('--save') + 1] : null;
if (!url) {
  console.error('Set GROCY_URL (and GROCY_API_KEY) to the Grocy to probe.');
  process.exit(2);
}

const client = new GrocyClient({ url, apiKey, insecure: args.includes('--insecure') });

/** Replace the names a household would not publish. */
function mask(value, kind = 'item') {
  if (Array.isArray(value)) {
    return value.map((item) => mask(item, kind));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (['name', 'chore_name', 'note', 'description', 'used_in'].includes(key) && item) {
      out[key] = `${kind} ${value.id ?? value.chore_id ?? value.battery_id ?? '?'}`;
    } else if (['username', 'first_name', 'last_name', 'display_name'].includes(key) && item) {
      out[key] = `user ${value.id ?? '?'}`;
    } else if (key === 'picture_file_name' && item) {
      out[key] = 'picture.jpg';
    } else if (key === 'os' || key === 'client') {
      out[key] = '(masked)';
    } else {
      const child = { product: 'product', battery: 'battery', chore: 'chore' }[key] ?? kind;
      out[key] = mask(item, child);
    }
  }
  return out;
}

const steps = [
  ['system-info', () => client.getSystemInfo(), 'system'],
  ['system-time', () => client.getSystemTime(), 'system'],
  ['db-changed-time', () => client.getDbChangedTime(), 'system'],
  ['stock-volatile', () => client.getVolatileStock(5), 'product'],
  ['chores', () => client.getChores(), 'chore'],
  ['batteries', () => client.getBatteries(), 'battery'],
  ['objects-batteries', () => client.getBatteryObjects(), 'battery'],
  ['tasks', () => client.getTasks(), 'task'],
  ['shopping-list', () => client.getShoppingList(), 'item'],
  ['objects-products', () => client.getProducts(), 'product'],
];

const answers = {};
let failed = false;
for (const [name, read, kind] of steps) {
  try {
    answers[name] = await read();
    const size = Array.isArray(answers[name]) ? `${answers[name].length} rows` : 'object';
    console.log(`OK   ${name.padEnd(18)} ${size}`);
    if (saveDir) {
      await mkdir(saveDir, { recursive: true });
      await writeFile(
        join(saveDir, `${name}.json`),
        `${JSON.stringify(mask(answers[name], kind), null, 2)}\n`,
      );
    }
  } catch (err) {
    failed = true;
    console.log(`FAIL ${name.padEnd(18)} ${err.kind ?? ''} ${err.message}`);
  }
}

if (answers['system-info'] && answers['stock-volatile']) {
  const offset = parseUtcOffset(answers['system-time']) ?? 0;
  const now = localStamp(Date.now(), offset);
  const names = productNames(answers['objects-products']);
  const snapshot = buildSnapshot(
    {
      volatile: parseVolatile(answers['stock-volatile'], now.slice(0, 10)),
      chores: parseChores(answers.chores),
      batteries: parseBatteries(answers.batteries, answers['objects-batteries']),
      tasks: parseTasks(answers.tasks),
      shopping: parseShoppingList(answers['shopping-list'], 1, names),
    },
    now,
  );
  console.log(
    `\nGrocy ${parseVersion(answers['system-info'])}, server time ${now} (UTC${offset >= 0 ? '+' : ''}${offset / 3600})`,
  );
  console.log('What the Gladys device would show:');
  console.log(JSON.stringify(counts(snapshot), null, 2));
  // The types Grocy uses for numbers: strings before Grocy 4.0.
  const row = answers.chores?.[0];
  if (row) {
    console.log(`chores[0].chore_id is a ${typeof row.chore_id} (Grocy 4: number)`);
  }
}
process.exit(failed ? 1 : 0);
