// -----------------------------------------------------------------------------
// Dashboard widgets (manifest `widgets`, Gladys 5.1+), one per daily question:
//
//   - consume_soon  "What must be eaten first?": the products expired, past
//     their best-before date and due soon, the most urgent first;
//   - today         "What is left to do today?": overdue and today's chores
//     and tasks, the batteries to charge, with a "done" button for the first
//     four (a tap on the wall tablet instead of opening Grocy);
//   - shopping_list "What do we buy?": the items of the shopping list, a
//     button that adds the products below their minimum stock, and an
//     "Add…" form (GladysAssistant/Gladys#3168, Gladys 5.2.0).
//
// Budget of the core (8 components: 6 tiles, 1 focal, 2 texts, 1 status, 4
// buttons): at most three tiles, one card list of 8 rows, one caption, four
// buttons. The figures are sent as values, not bound to the device features,
// so the widgets work before the device is added to Gladys.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { WIDGET_KEYS } from './hub.js';
import { ERROR_KINDS } from './grocy/client.js';
import { ERROR_TEXT, pick } from './texts.js';

// Action keys of the buttons: permanent once published, unique per widget
// (the core drops a button whose key is taken).
export const ACTIONS = Object.freeze({
  DONE: ['done_1', 'done_2', 'done_3', 'done_4'],
  ADD_MISSING: 'add_missing',
  ADD_ITEM: 'add_item',
});

const MAX_ROWS = 8;

export const TEXT = {
  notConfigured: {
    en: 'Enter the address of your Grocy and an API key in the configuration of the integration.',
    fr: "Saisissez l'adresse de votre Grocy et une clé d'API dans la configuration de l'intégration.",
    de: 'Gib die Adresse deines Grocy und einen API-Schlüssel in der Konfiguration der Integration ein.',
    es: 'Introduzca la dirección de su Grocy y una clave de API en la configuración de la integración.',
  },
  waiting: {
    en: 'Waiting for the first reading of Grocy…',
    fr: 'En attente de la première lecture de Grocy…',
    de: 'Warte auf das erste Auslesen von Grocy…',
    es: 'Esperando la primera lectura de Grocy…',
  },
  nothingToConsume: {
    en: 'Nothing to eat in a hurry.',
    fr: 'Rien à consommer en urgence.',
    de: 'Nichts muss dringend verbraucht werden.',
    es: 'Nada que consumir con urgencia.',
  },
  nothingToDo: {
    en: 'Nothing left to do today.',
    fr: "Plus rien à faire aujourd'hui.",
    de: 'Heute ist nichts mehr zu tun.',
    es: 'No queda nada por hacer hoy.',
  },
  emptyList: {
    en: 'The shopping list is empty.',
    fr: 'La liste de courses est vide.',
    de: 'Der Einkaufszettel ist leer.',
    es: 'La lista de la compra está vacía.',
  },
  more: {
    en: '+ {count} more in Grocy',
    fr: '+ {count} autre(s) dans Grocy',
    de: '+ {count} weitere in Grocy',
    es: '+ {count} más en Grocy',
  },
  updateGladys: {
    en: 'Update Gladys to 5.2.0 or later to type an item.',
    fr: 'Mettez Gladys à jour (5.2.0 ou plus) pour saisir un article.',
    de: 'Aktualisiere Gladys auf 5.2.0 oder neuer, um einen Artikel einzugeben.',
    es: 'Actualice Gladys a la versión 5.2.0 o posterior para escribir un artículo.',
  },
  // Tiles (24 characters at most).
  dueSoon: { en: 'Due soon', fr: 'Bientôt périmés', de: 'Bald fällig', es: 'Fecha próxima' },
  pastDate: { en: 'Past their date', fr: 'Date dépassée', de: 'Abgelaufen', es: 'Fecha superada' },
  belowMin: {
    en: 'Below min. stock',
    fr: 'Sous le stock min.',
    de: 'Unter Mindestbestand',
    es: 'Bajo el mínimo',
  },
  chores: { en: 'Chores', fr: 'Tâches ménagères', de: 'Hausarbeiten', es: 'Tareas del hogar' },
  tasks: { en: 'Tasks', fr: 'Tâches', de: 'Aufgaben', es: 'Tareas' },
  batteries: { en: 'Batteries', fr: 'Piles', de: 'Batterien', es: 'Baterías' },
  items: { en: 'Items', fr: 'Articles', de: 'Artikel', es: 'Artículos' },
  // Badges (16 characters at most).
  expired: { en: 'Expired', fr: 'Périmé', de: 'Abgelaufen', es: 'Caducado' },
  overdue: { en: 'Overdue', fr: 'En retard', de: 'Überfällig', es: 'Atrasado' },
  today: { en: 'Today', fr: "Aujourd'hui", de: 'Heute', es: 'Hoy' },
  tomorrow: { en: 'Tomorrow', fr: 'Demain', de: 'Morgen', es: 'Mañana' },
  inDays: { en: 'In {count} d', fr: 'Dans {count} j', de: 'In {count} T.', es: 'En {count} d' },
  daysAgo: {
    en: '{count} d ago',
    fr: 'Il y a {count} j',
    de: 'Vor {count} T.',
    es: 'Hace {count} d',
  },
  // Row kinds (subtitles).
  chore: { en: 'Chore', fr: 'Tâche ménagère', de: 'Hausarbeit', es: 'Tarea del hogar' },
  task: { en: 'Task', fr: 'Tâche', de: 'Aufgabe', es: 'Tarea' },
  battery: {
    en: 'Battery to charge',
    fr: 'Pile à recharger',
    de: 'Batterie laden',
    es: 'Batería por cargar',
  },
  // Buttons (24 characters at most).
  addMissing: {
    en: 'Add missing products',
    fr: 'Ajouter les manquants',
    de: 'Fehlendes hinzufügen',
    es: 'Añadir los que faltan',
  },
  addItem: { en: 'Add…', fr: 'Ajouter…', de: 'Hinzufügen…', es: 'Añadir…' },
  // Form fields.
  item: {
    en: 'Product or text',
    fr: 'Produit ou texte',
    de: 'Produkt oder Text',
    es: 'Producto o texto',
  },
  amount: { en: 'Amount', fr: 'Quantité', de: 'Menge', es: 'Cantidad' },
};

// Toasts after a tap (200 characters at most).
export const DONE_TEXT = {
  en: {
    chore: (name) => `Chore "${name}" done.`,
    task: (name) => `Task "${name}" completed.`,
    battery: (name) => `Battery "${name}" charged.`,
    missing: (count) => `${count} product(s) added to the shopping list.`,
    added: (name) => `"${name}" added to the shopping list.`,
  },
  fr: {
    chore: (name) => `Tâche ménagère « ${name} » faite.`,
    task: (name) => `Tâche « ${name} » terminée.`,
    battery: (name) => `Pile « ${name} » rechargée.`,
    missing: (count) => `${count} produit(s) ajouté(s) à la liste de courses.`,
    added: (name) => `« ${name} » ajouté à la liste de courses.`,
  },
  de: {
    chore: (name) => `Hausarbeit „${name}“ erledigt.`,
    task: (name) => `Aufgabe „${name}“ abgeschlossen.`,
    battery: (name) => `Batterie „${name}“ geladen.`,
    missing: (count) => `${count} Produkt(e) zum Einkaufszettel hinzugefügt.`,
    added: (name) => `„${name}“ zum Einkaufszettel hinzugefügt.`,
  },
  es: {
    chore: (name) => `Tarea del hogar «${name}» hecha.`,
    task: (name) => `Tarea «${name}» completada.`,
    battery: (name) => `Batería «${name}» cargada.`,
    missing: (count) => `${count} producto(s) añadido(s) a la lista de la compra.`,
    added: (name) => `«${name}» añadido a la lista de la compra.`,
  },
};

const t = (text, language, values = {}) =>
  pick(text, language).replace(/\{(\w+)\}/g, (hole, key) => String(values[key] ?? hole));
const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
const amountText = (amount) =>
  Number.isInteger(amount) ? String(amount) : String(Math.round(amount * 100) / 100);

function message(text, language, ttl = 300) {
  return {
    ttl_seconds: ttl,
    components: [{ type: 'text', variant: 'body', text: t(text, language) }],
  };
}

/** The common answer when there is nothing to show yet, null otherwise. */
function unavailable(hub, language) {
  if (!hub.config?.url) {
    return message(TEXT.notConfigured, language);
  }
  if (hub.error) {
    const text = ERROR_TEXT[hub.error.kind] ?? ERROR_TEXT[ERROR_KINDS.HTTP];
    return message(text, language, 60);
  }
  if (!hub.snapshot) {
    return message(TEXT.waiting, language, 30);
  }
  return null;
}

/** "Today", "Tomorrow", "In 3 d", "2 d ago". */
export function relativeDay(days, language) {
  if (days === 0) {
    return t(TEXT.today, language);
  }
  if (days === 1) {
    return t(TEXT.tomorrow, language);
  }
  return days > 1
    ? t(TEXT.inDays, language, { count: days })
    : t(TEXT.daysAgo, language, { count: -days });
}

/** The rows beyond the card list, as a caption. */
function more(total, language) {
  return total > MAX_ROWS
    ? [
        {
          type: 'text',
          variant: 'caption',
          text: t(TEXT.more, language, { count: total - MAX_ROWS }),
        },
      ]
    : [];
}

// --- consume_soon ------------------------------------------------------------

function consumeSoon(hub, { language = 'en' }) {
  const empty = unavailable(hub, language);
  if (empty) {
    return empty;
  }
  const { dueSoon, overdue, expired } = hub.snapshot.products;
  // Expired (use by: throw away) first, then past best-before, then due soon.
  const late = [...expired, ...overdue];
  const rows = [...late, ...dueSoon];
  const components = [
    {
      type: 'value',
      value: late.length,
      label: t(TEXT.pastDate, language),
      icon: 'alert-octagon',
      color: late.length ? WIDGET_COLORS.DANGER : WIDGET_COLORS.NEUTRAL,
    },
    {
      type: 'value',
      value: dueSoon.length,
      label: t(TEXT.dueSoon, language),
      icon: 'clock',
      color: dueSoon.length ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
    },
  ];
  if (rows.length === 0) {
    components.push({ type: 'text', variant: 'body', text: t(TEXT.nothingToConsume, language) });
  } else {
    components.push({
      type: 'card-list',
      display: 'list',
      items: rows.slice(0, MAX_ROWS).map((entry) => ({
        title: fit(entry.name, 60),
        subtitle: `${amountText(entry.amount)} · ${entry.date}`,
        badge:
          entry.status === 'expired'
            ? { text: t(TEXT.expired, language), color: WIDGET_COLORS.DANGER }
            : entry.status === 'overdue'
              ? { text: t(TEXT.overdue, language), color: WIDGET_COLORS.DANGER }
              : {
                  text: fit(relativeDay(entry.daysLeft ?? 0, language), 16),
                  color: WIDGET_COLORS.WARNING,
                },
      })),
    });
    components.push(...more(rows.length, language));
  }
  return { ttl_seconds: 300, components };
}

// --- today ----------------------------------------------------------------------

/** The rows of the "today" widget, most urgent first. */
export function todayRows(snapshot) {
  const chore = (item, late) => ({
    kind: 'chore',
    id: item.id,
    name: item.name,
    late,
    who: item.assignedTo,
  });
  const task = (item, late) => ({
    kind: 'task',
    id: item.id,
    name: item.name,
    late,
    who: item.assignedTo,
  });
  return [
    ...snapshot.chores.overdue.map((item) => chore(item, true)),
    ...snapshot.tasks.overdue.map((item) => task(item, true)),
    ...snapshot.chores.dueToday.map((item) => chore(item, false)),
    ...snapshot.tasks.dueToday.map((item) => task(item, false)),
    ...snapshot.batteries.due.map((item) => ({
      kind: 'battery',
      id: item.id,
      name: item.name,
      late: item.next < snapshot.now,
      who: '',
    })),
  ];
}

function today(hub, { language = 'en' }) {
  const empty = unavailable(hub, language);
  if (empty) {
    return empty;
  }
  const { chores, tasks, batteries } = hub.snapshot;
  const rows = todayRows(hub.snapshot);
  const tile = (value, label, icon) => ({
    type: 'value',
    value,
    label: t(label, language),
    icon,
    color: value ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
  });
  const components = [
    tile(chores.overdue.length + chores.dueToday.length, TEXT.chores, 'home'),
    tile(tasks.overdue.length + tasks.dueToday.length, TEXT.tasks, 'check-square'),
    tile(batteries.due.length, TEXT.batteries, 'battery-charging'),
  ];
  if (rows.length === 0) {
    components.push({ type: 'text', variant: 'body', text: t(TEXT.nothingToDo, language) });
    return { ttl_seconds: 300, components };
  }
  components.push({
    type: 'card-list',
    display: 'list',
    items: rows.slice(0, MAX_ROWS).map((row) => ({
      title: fit(row.name, 60),
      subtitle: fit([t(TEXT[row.kind], language), row.who].filter(Boolean).join(' · '), 80),
      badge: row.late
        ? { text: t(TEXT.overdue, language), color: WIDGET_COLORS.DANGER }
        : { text: t(TEXT.today, language), color: WIDGET_COLORS.INFO },
    })),
  });
  components.push(...more(rows.length, language));
  rows.slice(0, ACTIONS.DONE.length).forEach((row, index) => {
    components.push({
      type: 'button',
      label: fit(row.name, 24),
      icon: row.kind === 'battery' ? 'battery-charging' : 'check',
      style: 'secondary',
      action: { key: ACTIONS.DONE[index], params: { kind: row.kind, id: row.id } },
    });
  });
  // Time moves chores from "today" to "overdue": refresh within minutes.
  return { ttl_seconds: 120, components };
}

// --- shopping_list ---------------------------------------------------------------

function shoppingList(hub, { language = 'en' }) {
  const empty = unavailable(hub, language);
  if (empty) {
    return empty;
  }
  const items = hub.snapshot.shopping;
  const missing = hub.snapshot.products.missing.length;
  const components = [
    { type: 'value', value: items.length, label: t(TEXT.items, language), icon: 'shopping-cart' },
    {
      type: 'value',
      value: missing,
      label: t(TEXT.belowMin, language),
      icon: 'trending-down',
      color: missing ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
    },
  ];
  if (items.length === 0) {
    components.push({ type: 'text', variant: 'body', text: t(TEXT.emptyList, language) });
  } else {
    components.push({
      type: 'card-list',
      display: 'list',
      items: items.slice(0, MAX_ROWS).map((item) => ({
        title: fit(item.name, 60),
        subtitle: fit([amountText(item.amount), item.note].filter(Boolean).join(' · '), 80),
      })),
    });
    components.push(...more(items.length, language));
  }
  components.push(
    {
      type: 'button',
      label: t(TEXT.addMissing, language),
      icon: 'trending-down',
      style: 'secondary',
      action: { key: ACTIONS.ADD_MISSING },
    },
    {
      type: 'button',
      label: t(TEXT.addItem, language),
      icon: 'plus',
      style: 'secondary',
      action: {
        key: ACTIONS.ADD_ITEM,
        fields: [
          { key: 'item', type: 'string', required: true, label: TEXT.item },
          {
            key: 'amount',
            type: 'number',
            required: true,
            min: 1,
            max: 1000,
            default: 1,
            label: TEXT.amount,
          },
        ],
      },
    },
  );
  return { ttl_seconds: 300, components };
}

// --- Taps ------------------------------------------------------------------------

const toast = (render) =>
  Object.fromEntries(Object.entries(DONE_TEXT).map(([language, text]) => [language, render(text)]));

async function todayAction(hub, { actionKey, params = {} }) {
  if (!ACTIONS.DONE.includes(actionKey)) {
    throw new Error(`Unknown action ${actionKey}`);
  }
  if (params.kind === 'chore') {
    const { chore } = await hub.executeChore({ id: params.id });
    return { message: toast((text) => text.chore(chore)) };
  }
  if (params.kind === 'task') {
    const { task } = await hub.completeTask(params.id);
    return { message: toast((text) => text.task(task)) };
  }
  if (params.kind === 'battery') {
    const { battery } = await hub.chargeBattery({ id: params.id });
    return { message: toast((text) => text.battery(battery)) };
  }
  throw new Error(`Unknown item kind ${params.kind}`);
}

async function shoppingAction(hub, { actionKey, values }) {
  if (actionKey === ACTIONS.ADD_MISSING) {
    const count = await hub.addMissingProducts();
    return { message: toast((text) => text.missing(count)) };
  }
  if (actionKey === ACTIONS.ADD_ITEM) {
    if (!values || typeof values.item !== 'string') {
      // A Gladys older than 5.2.0 relays the tap without the form.
      throw new Error(t(TEXT.updateGladys, hub.language));
    }
    const { item } = await hub.addToShoppingList(values.item, values.amount ?? 1);
    return { message: toast((text) => text.added(item)) };
  }
  throw new Error(`Unknown action ${actionKey}`);
}

export const WIDGETS = {
  [WIDGET_KEYS.CONSUME_SOON]: { get: consumeSoon },
  [WIDGET_KEYS.TODAY]: { get: today, action: todayAction },
  [WIDGET_KEYS.SHOPPING]: { get: shoppingList, action: shoppingAction },
};
