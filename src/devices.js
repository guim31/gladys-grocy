// -----------------------------------------------------------------------------
// One Gladys device for the Grocy instance.
//
// Identity: a fixed platform id, "1" (the first and only instance of the
// configuration), not the address: moving Grocy to another address, or from
// HTTP to HTTPS, keeps the device and its history. Grocy exposes no stable
// instance id to use instead.
//
// Features: counters (counter-sensor/integer, the couple Gladys shows as a
// number with a history), read only. Each one counts what the matching page of
// Grocy shows in red or orange, so a scene can test "> 0" with the device
// trigger of Gladys. The names (what the products are, which chore) are in the
// widgets and in the scene triggers, not in the device: a state is a number.
//
// The device is published with should_poll: false: the integration reads
// Grocy on its own timer (src/hub.js), at the interval of the configuration.
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import { hostOf } from './config.js';
import { counts } from './grocy/model.js';

export const DEVICE_TYPE = 'grocy';
export const PLATFORM_ID = '1';
export const URL_PARAM = 'GROCY_URL';

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  PRODUCTS_DUE_SOON: 'products_due_soon',
  PRODUCTS_OVERDUE: 'products_overdue',
  PRODUCTS_EXPIRED: 'products_expired',
  PRODUCTS_MISSING: 'products_below_min_stock',
  SHOPPING_ITEMS: 'shopping_list_items',
  CHORES_DUE_TODAY: 'chores_due_today',
  CHORES_OVERDUE: 'chores_overdue',
  BATTERIES_DUE: 'batteries_due',
  TASKS_DUE_TODAY: 'tasks_due_today',
  TASKS_OVERDUE: 'tasks_overdue',
});

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [FEATURE_KEYS.PRODUCTS_DUE_SOON]: 'Products due soon',
    [FEATURE_KEYS.PRODUCTS_OVERDUE]: 'Products past best-before',
    [FEATURE_KEYS.PRODUCTS_EXPIRED]: 'Expired products',
    [FEATURE_KEYS.PRODUCTS_MISSING]: 'Products below min. stock',
    [FEATURE_KEYS.SHOPPING_ITEMS]: 'Shopping list items',
    [FEATURE_KEYS.CHORES_DUE_TODAY]: 'Chores due today',
    [FEATURE_KEYS.CHORES_OVERDUE]: 'Overdue chores',
    [FEATURE_KEYS.BATTERIES_DUE]: 'Batteries to charge',
    [FEATURE_KEYS.TASKS_DUE_TODAY]: 'Tasks due today',
    [FEATURE_KEYS.TASKS_OVERDUE]: 'Overdue tasks',
  },
  fr: {
    [FEATURE_KEYS.PRODUCTS_DUE_SOON]: 'Produits bientôt périmés',
    [FEATURE_KEYS.PRODUCTS_OVERDUE]: 'Produits à date dépassée',
    [FEATURE_KEYS.PRODUCTS_EXPIRED]: 'Produits périmés',
    [FEATURE_KEYS.PRODUCTS_MISSING]: 'Produits sous le stock min.',
    [FEATURE_KEYS.SHOPPING_ITEMS]: 'Articles à acheter',
    [FEATURE_KEYS.CHORES_DUE_TODAY]: 'Tâches ménagères du jour',
    [FEATURE_KEYS.CHORES_OVERDUE]: 'Tâches ménagères en retard',
    [FEATURE_KEYS.BATTERIES_DUE]: 'Piles à recharger',
    [FEATURE_KEYS.TASKS_DUE_TODAY]: 'Tâches du jour',
    [FEATURE_KEYS.TASKS_OVERDUE]: 'Tâches en retard',
  },
  de: {
    [FEATURE_KEYS.PRODUCTS_DUE_SOON]: 'Bald fällige Produkte',
    [FEATURE_KEYS.PRODUCTS_OVERDUE]: 'Überfällige Produkte',
    [FEATURE_KEYS.PRODUCTS_EXPIRED]: 'Abgelaufene Produkte',
    [FEATURE_KEYS.PRODUCTS_MISSING]: 'Produkte unter Mindestbestand',
    [FEATURE_KEYS.SHOPPING_ITEMS]: 'Artikel auf dem Einkaufszettel',
    [FEATURE_KEYS.CHORES_DUE_TODAY]: 'Hausarbeiten heute fällig',
    [FEATURE_KEYS.CHORES_OVERDUE]: 'Überfällige Hausarbeiten',
    [FEATURE_KEYS.BATTERIES_DUE]: 'Zu ladende Batterien',
    [FEATURE_KEYS.TASKS_DUE_TODAY]: 'Aufgaben heute fällig',
    [FEATURE_KEYS.TASKS_OVERDUE]: 'Überfällige Aufgaben',
  },
  es: {
    [FEATURE_KEYS.PRODUCTS_DUE_SOON]: 'Productos con fecha próxima',
    [FEATURE_KEYS.PRODUCTS_OVERDUE]: 'Productos con fecha superada',
    [FEATURE_KEYS.PRODUCTS_EXPIRED]: 'Productos caducados',
    [FEATURE_KEYS.PRODUCTS_MISSING]: 'Productos bajo existencias mín.',
    [FEATURE_KEYS.SHOPPING_ITEMS]: 'Artículos en la lista de la compra',
    [FEATURE_KEYS.CHORES_DUE_TODAY]: 'Tareas del hogar de hoy',
    [FEATURE_KEYS.CHORES_OVERDUE]: 'Tareas del hogar atrasadas',
    [FEATURE_KEYS.BATTERIES_DUE]: 'Baterías por recargar',
    [FEATURE_KEYS.TASKS_DUE_TODAY]: 'Tareas de hoy',
    [FEATURE_KEYS.TASKS_OVERDUE]: 'Tareas atrasadas',
  },
};

// Display bounds (the core never applies them on write).
const COUNTER_MAX = 100_000;

// Order = display order in Gladys; `count` reads model.counts().
const FEATURES = [
  [FEATURE_KEYS.PRODUCTS_DUE_SOON, 'productsDueSoon'],
  [FEATURE_KEYS.PRODUCTS_OVERDUE, 'productsOverdue'],
  [FEATURE_KEYS.PRODUCTS_EXPIRED, 'productsExpired'],
  [FEATURE_KEYS.PRODUCTS_MISSING, 'productsMissing'],
  [FEATURE_KEYS.SHOPPING_ITEMS, 'shoppingItems'],
  [FEATURE_KEYS.CHORES_DUE_TODAY, 'choresDueToday'],
  [FEATURE_KEYS.CHORES_OVERDUE, 'choresOverdue'],
  [FEATURE_KEYS.BATTERIES_DUE, 'batteriesDue'],
  [FEATURE_KEYS.TASKS_DUE_TODAY, 'tasksDueToday'],
  [FEATURE_KEYS.TASKS_OVERDUE, 'tasksOverdue'],
].map(([key, count]) => ({
  key,
  count,
  definition: {
    category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
    type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
    read_only: true,
    has_feedback: false,
    keep_history: true,
    min: 0,
    max: COUNTER_MAX,
  },
}));

/** External ids of the device and its features. */
export const deviceIds = (gladys) => gladys.externalIds(DEVICE_TYPE, PLATFORM_ID);

/** The name of the device: "Grocy", or "Grocy (address)" never — the address can change. */
export const DEVICE_NAME = 'Grocy';

/**
 * The discovery payload.
 * @param {object} gladys SDK client
 * @param {{ url: string }} config normalized configuration
 */
export function buildDevice(gladys, config) {
  const ids = deviceIds(gladys);
  const names = NAMES[config.language] ?? NAMES.en;
  return {
    name: DEVICE_NAME,
    external_id: ids.device,
    should_poll: false,
    params: [{ name: URL_PARAM, value: hostOf(config.url) }],
    features: FEATURES.map(({ key, definition }) => ({
      ...definition,
      name: names[key],
      external_id: ids.feature(key),
    })),
  };
}

/**
 * The value of every feature for a snapshot (null: nothing to publish).
 * @returns {Array<{ key: string, externalId: string, value: number|null }>}
 */
export function featureValues(gladys, snapshot) {
  const ids = deviceIds(gladys);
  const values = snapshot ? counts(snapshot) : null;
  return FEATURES.map(({ key, count }) => ({
    key,
    externalId: ids.feature(key),
    value: values ? values[count] : null,
  }));
}
