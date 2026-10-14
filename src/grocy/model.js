// -----------------------------------------------------------------------------
// Grocy answers → one snapshot of what the household has to deal with.
//
// Pure functions, no network. They read both shapes of the API: Grocy 4 sends
// numbers and booleans, Grocy 3 sent nearly every field as a string.
//
// The rules are the ones of the Grocy interface (controllers/*Controller.php of
// grocy/grocy, MIT), rewritten here:
//   - products: Grocy's own lists of /stock/volatile — due soon (within the
//     configured days, today included), overdue (the best-before date of a
//     "best before" product has passed: often still fine), expired (the
//     expiration date of a "use by" product has passed: throw it away), and
//     below their minimum stock;
//   - chores and batteries: overdue when the next estimated time has passed,
//     due today when it falls before tonight 23:59:59 — a chore tracked by
//     date only is due at 23:59:59 of its day, so it is never overdue on it;
//   - tasks: overdue when their due date is before today, due today on it.
// Times are the server's local time ("YYYY-MM-DD HH:MM:SS", no zone): they are
// compared with the server's own clock, from /system/time.
// -----------------------------------------------------------------------------

// The date Grocy gives what never comes (a manual chore, a battery without interval).
export const NEVER = '2999';

export const PRODUCT_STATUS = Object.freeze({
  DUE_SOON: 'due_soon',
  OVERDUE: 'overdue',
  EXPIRED: 'expired',
});

/** A number from a Grocy field (number or numeric string), null otherwise. */
export function num(value) {
  const number =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;
  return Number.isFinite(number) ? number : null;
}

/** A Grocy boolean: true, 1 or "1". */
export const flag = (value) => value === true || value === 1 || value === '1';

const text = (value) =>
  typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';

const list = (value) => (Array.isArray(value) ? value : []);

/** "YYYY-MM-DD HH:MM:SS" of a Grocy time, '' when absent. */
const stamp = (value) => text(value).replace('T', ' ').slice(0, 19);

/** Grocy version, e.g. "4.7.1", from /system/info. */
export function parseVersion(info) {
  const version = info?.grocy_version?.Version;
  return typeof version === 'string' && version.trim() ? version.trim() : null;
}

/** The server's UTC offset in seconds, from /system/time (time_local − time_utc). */
export function parseUtcOffset(time) {
  const local = Date.parse(`${stamp(time?.time_local).replace(' ', 'T')}Z`);
  const utc = Date.parse(`${stamp(time?.time_utc).replace(' ', 'T')}Z`);
  if (!Number.isFinite(local) || !Number.isFinite(utc)) {
    return null;
  }
  // Rounded to the quarter of an hour: the two fields may straddle a second.
  return Math.round((local - utc) / 900_000) * 900;
}

/** The server's local time, "YYYY-MM-DD HH:MM:SS", at the instant `nowMs`. */
export function localStamp(nowMs, utcOffsetSeconds = 0) {
  return new Date(nowMs + utcOffsetSeconds * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

/** Whole days from `today` to `date` (both "YYYY-MM-DD"): negative in the past. */
export function daysBetween(today, date) {
  const from = Date.parse(`${today.slice(0, 10)}T00:00:00Z`);
  const to = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return null;
  }
  return Math.round((to - from) / 86_400_000);
}

/** Product id → name, from /objects/products. */
export function productNames(products) {
  const names = new Map();
  for (const product of list(products)) {
    const id = num(product?.id);
    const name = text(product?.name);
    if (id !== null && name) {
      names.set(id, name);
    }
  }
  return names;
}

function stockEntry(entry, status, today) {
  const productId = num(entry?.product_id ?? entry?.product?.id);
  const name = text(entry?.product?.name);
  const date = text(entry?.best_before_date).slice(0, 10);
  if (productId === null || !name || !date) {
    return null;
  }
  return {
    productId,
    name,
    date,
    daysLeft: daysBetween(today, date),
    amount: num(entry?.amount_aggregated) ?? num(entry?.amount) ?? 0,
    status,
  };
}

/**
 * The products of /stock/volatile.
 * @returns {{ dueSoon: object[], overdue: object[], expired: object[], missing: object[] }}
 */
export function parseVolatile(volatile, today) {
  const entries = (key, status, keep = () => true) =>
    list(volatile?.[key])
      .filter(keep)
      .map((entry) => stockEntry(entry, status, today))
      .filter(Boolean)
      .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  return {
    dueSoon: entries('due_products', PRODUCT_STATUS.DUE_SOON),
    // The overdue list of the API holds both kinds of due date: the "use by"
    // ones are the expired list, as in the Grocy interface.
    overdue: entries(
      'overdue_products',
      PRODUCT_STATUS.OVERDUE,
      (entry) => num(entry?.due_type ?? entry?.product?.due_type) !== 2,
    ),
    expired: entries('expired_products', PRODUCT_STATUS.EXPIRED),
    missing: list(volatile?.missing_products)
      .map((entry) => ({
        productId: num(entry?.id),
        name: text(entry?.name),
        missing: num(entry?.amount_missing) ?? 0,
      }))
      .filter((entry) => entry.productId !== null && entry.name)
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** The not-done items of one shopping list, named after their product or their note. */
export function parseShoppingList(rows, listId, names) {
  return list(rows)
    .filter((row) => num(row?.shopping_list_id ?? 1) === listId && !flag(row?.done))
    .map((row) => {
      const productId = num(row?.product_id);
      const note = text(row?.note);
      return {
        id: num(row?.id),
        productId,
        name: (productId !== null ? names.get(productId) : null) ?? note,
        note: productId !== null ? note : '',
        amount: num(row?.amount) ?? 0,
      };
    })
    .filter((item) => item.id !== null && item.name);
}

/** The scheduled chores of /chores (active ones only, the API already filters). */
export function parseChores(rows) {
  return list(rows)
    .map((row) => ({
      id: num(row?.chore_id ?? row?.id),
      name: text(row?.chore_name),
      next: stamp(row?.next_estimated_execution_time),
      assignedTo: text(row?.next_execution_assigned_user?.display_name),
    }))
    .filter((chore) => chore.id !== null && chore.name);
}

/**
 * The batteries of /batteries. Grocy 4 embeds the battery object; for Grocy 3
 * the objects come from /objects/batteries.
 */
export function parseBatteries(rows, objects = []) {
  const byId = new Map(list(objects).map((battery) => [num(battery?.id), battery]));
  return list(rows)
    .map((row) => {
      const id = num(row?.battery_id ?? row?.id);
      const battery = row?.battery ?? byId.get(id);
      if (battery && battery.active !== undefined && !flag(battery.active)) {
        return null;
      }
      return {
        id,
        name: text(battery?.name),
        next: stamp(row?.next_estimated_charge_time),
        // No interval: never due, whatever the date says.
        scheduled: (num(battery?.charge_interval_days) ?? 0) > 0,
      };
    })
    .filter((battery) => battery && battery.id !== null && battery.name);
}

/** The open tasks of /tasks. */
export function parseTasks(rows) {
  return list(rows)
    .filter((row) => !flag(row?.done))
    .map((row) => ({
      id: num(row?.id),
      name: text(row?.name),
      due: text(row?.due_date).slice(0, 10),
      assignedTo: text(row?.assigned_to_user?.display_name),
    }))
    .filter((task) => task.id !== null && task.name);
}

const byTime = (key) => (a, b) => a[key].localeCompare(b[key]) || a.name.localeCompare(b.name);

/**
 * What is due, from the parsed lists, at the server's local time `now`.
 * @param {object} raw { volatile, chores, batteries, tasks, shopping } parsed above
 * @param {string} now "YYYY-MM-DD HH:MM:SS", the server's local time
 */
export function buildSnapshot(raw, now) {
  const endOfToday = `${now.slice(0, 10)} 23:59:59`;
  const today = now.slice(0, 10);
  const scheduled = (time) => time !== '' && !time.startsWith(NEVER);

  const chores = list(raw.chores).filter((chore) => scheduled(chore.next));
  const batteries = list(raw.batteries).filter(
    (battery) => battery.scheduled && scheduled(battery.next),
  );
  const tasks = list(raw.tasks).filter((task) => task.due !== '');

  return {
    now,
    products: {
      dueSoon: raw.volatile?.dueSoon ?? [],
      overdue: raw.volatile?.overdue ?? [],
      expired: raw.volatile?.expired ?? [],
      missing: raw.volatile?.missing ?? [],
    },
    shopping: list(raw.shopping),
    chores: {
      overdue: chores.filter((chore) => chore.next < now).sort(byTime('next')),
      dueToday: chores
        .filter((chore) => chore.next >= now && chore.next <= endOfToday)
        .sort(byTime('next')),
    },
    // To charge today or already late: the Grocy "overdue" and "due today" together.
    batteries: {
      due: batteries.filter((battery) => battery.next <= endOfToday).sort(byTime('next')),
    },
    tasks: {
      overdue: tasks.filter((task) => task.due < today).sort(byTime('due')),
      dueToday: tasks.filter((task) => task.due === today).sort(byTime('due')),
    },
  };
}

/** The counts published as device features. */
export function counts(snapshot) {
  return {
    productsDueSoon: snapshot.products.dueSoon.length,
    productsOverdue: snapshot.products.overdue.length,
    productsExpired: snapshot.products.expired.length,
    productsMissing: snapshot.products.missing.length,
    shoppingItems: snapshot.shopping.length,
    choresDueToday: snapshot.chores.dueToday.length,
    choresOverdue: snapshot.chores.overdue.length,
    batteriesDue: snapshot.batteries.due.length,
    tasksDueToday: snapshot.tasks.dueToday.length,
    tasksOverdue: snapshot.tasks.overdue.length,
  };
}

// --- Names typed in a scene ---------------------------------------------------

/** Lower case, no accent, single spaces: "  Crème fraîche " → "creme fraiche". */
export const normalizeName = (value) =>
  text(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');

/**
 * Find an item by the name typed in a scene: the exact name first (case and
 * accents aside), else the only name that contains the text.
 * @template {{ name: string }} T
 * @param {T[]} items
 * @param {string} typed
 * @returns {{ match: T|null, exact: boolean, candidates: T[] }} exact: the
 *   name itself was typed; candidates: the names that contain the text when
 *   there are several
 */
export function findByName(items, typed) {
  const wanted = normalizeName(typed);
  if (!wanted) {
    return { match: null, exact: false, candidates: [] };
  }
  const exact = items.find((item) => normalizeName(item.name) === wanted);
  if (exact) {
    return { match: exact, exact: true, candidates: [] };
  }
  const partial = items.filter((item) => normalizeName(item.name).includes(wanted));
  return partial.length === 1
    ? { match: partial[0], exact: false, candidates: [] }
    : { match: null, exact: false, candidates: partial };
}
