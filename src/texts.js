// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widgets (src/widgets.js):
// connection status, errors, the "Test the connection" report, scene action
// errors. Four languages, the four of the Gladys interface; German says "du",
// Spanish "usted". The words are Grocy's own where it has them (its
// localization/*.po). test/i18n.test.js checks every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './grocy/client.js';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noUrl: {
    en: 'Enter the address of your Grocy and an API key in the configuration.',
    fr: "Saisissez l'adresse de votre Grocy et une clé d'API dans la configuration.",
    de: 'Gib die Adresse deines Grocy und einen API-Schlüssel in der Konfiguration ein.',
    es: 'Introduzca la dirección de su Grocy y una clave de API en la configuración.',
  },
  invalidUrl: {
    en: 'Address not understood, e.g. http://192.168.1.10:9283',
    fr: 'Adresse incomprise, ex. http://192.168.1.10:9283',
    de: 'Adresse nicht verstanden, z. B. http://192.168.1.10:9283',
    es: 'Dirección no válida, p. ej. http://192.168.1.10:9283',
  },
};

// One short explanation per error kind (src/grocy/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'Grocy does not answer',
    fr: 'Grocy ne répond pas',
    de: 'Grocy antwortet nicht',
    es: 'Grocy no responde',
  },
  [ERROR_KINDS.TLS]: {
    en: 'certificate refused: tick "Accept self-signed certificates"',
    fr: 'certificat refusé : cochez « Accepter les certificats auto-signés »',
    de: 'Zertifikat abgelehnt: Aktiviere „Selbstsignierte Zertifikate akzeptieren“',
    es: 'certificado rechazado: marque «Aceptar certificados autofirmados»',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'API key refused: create one in Grocy (Manage API keys)',
    fr: "clé d'API refusée : créez-en une dans Grocy (Gérer les clefs API)",
    de: 'API-Schlüssel abgelehnt: Erstelle einen in Grocy (API-Schlüssel verwalten)',
    es: 'clave de API rechazada: cree una en Grocy (Administrar las claves de API)',
  },
  [ERROR_KINDS.REDIRECT]: {
    en: 'the address redirects: enter the https:// address of Grocy',
    fr: "l'adresse redirige : saisissez l'adresse https:// de Grocy",
    de: 'die Adresse leitet um: Gib die https://-Adresse von Grocy ein',
    es: 'la dirección redirige: introduzca la dirección https:// de Grocy',
  },
  [ERROR_KINDS.NOT_GROCY]: {
    en: 'no Grocy API at this address',
    fr: 'aucune API Grocy à cette adresse',
    de: 'keine Grocy-API unter dieser Adresse',
    es: 'no hay ninguna API de Grocy en esta dirección',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'unexpected answer, see the logs',
    fr: 'réponse inattendue, voir les logs',
    de: 'unerwartete Antwort, sieh in den Protokollen nach',
    es: 'respuesta inesperada, consulte los registros',
  },
};

// The "Test the connection" report.
export const REPORT_TEXT = {
  en: {
    ok: (version) => `Grocy ${version} answers.`,
    products: (soon, late) => `Products: ${soon} due soon, ${late} past their date.`,
    chores: (today, late) => `Chores: ${today} due today, ${late} overdue.`,
    shopping: (items) => `Shopping list: ${items} item(s).`,
  },
  fr: {
    ok: (version) => `Grocy ${version} répond.`,
    products: (soon, late) => `Produits : ${soon} bientôt périmé(s), ${late} à date dépassée.`,
    chores: (today, late) => `Tâches ménagères : ${today} du jour, ${late} en retard.`,
    shopping: (items) => `Liste de courses : ${items} article(s).`,
  },
  de: {
    ok: (version) => `Grocy ${version} antwortet.`,
    products: (soon, late) => `Produkte: ${soon} bald fällig, ${late} über dem Datum.`,
    chores: (today, late) => `Hausarbeiten: ${today} heute fällig, ${late} überfällig.`,
    shopping: (items) => `Einkaufszettel: ${items} Artikel.`,
  },
  es: {
    ok: (version) => `Grocy ${version} responde.`,
    products: (soon, late) => `Productos: ${soon} con fecha próxima, ${late} con fecha superada.`,
    chores: (today, late) => `Tareas del hogar: ${today} para hoy, ${late} atrasada(s).`,
    shopping: (items) => `Lista de la compra: ${items} artículo(s).`,
  },
};

// Errors of the scene actions and widget buttons (shown in Gladys). `{name}`
// is the text typed in the scene, `{names}` a few candidates.
export const ACTION_TEXT = {
  notConfigured: {
    en: 'Grocy is not configured.',
    fr: "Grocy n'est pas configuré.",
    de: 'Grocy ist nicht konfiguriert.',
    es: 'Grocy no está configurado.',
  },
  emptyName: {
    en: 'Enter a name.',
    fr: 'Saisissez un nom.',
    de: 'Gib einen Namen ein.',
    es: 'Introduzca un nombre.',
  },
  badAmount: {
    en: 'The amount must be a number above 0.',
    fr: 'La quantité doit être un nombre supérieur à 0.',
    de: 'Die Menge muss eine Zahl über 0 sein.',
    es: 'La cantidad debe ser un número mayor que 0.',
  },
  productNotFound: {
    en: 'No product or barcode "{name}" in Grocy.',
    fr: 'Aucun produit ni code-barres « {name} » dans Grocy.',
    de: 'Kein Produkt und kein Barcode „{name}“ in Grocy.',
    es: 'No hay ningún producto ni código de barras «{name}» en Grocy.',
  },
  choreNotFound: {
    en: 'No chore "{name}" in Grocy.',
    fr: 'Aucune tâche ménagère « {name} » dans Grocy.',
    de: 'Keine Hausarbeit „{name}“ in Grocy.',
    es: 'No hay ninguna tarea del hogar «{name}» en Grocy.',
  },
  batteryNotFound: {
    en: 'No battery "{name}" in Grocy.',
    fr: 'Aucune pile « {name} » dans Grocy.',
    de: 'Keine Batterie „{name}“ in Grocy.',
    es: 'No hay ninguna batería «{name}» en Grocy.',
  },
  ambiguous: {
    en: '"{name}" matches several names: {names}. Type the full name.',
    fr: '« {name} » correspond à plusieurs noms : {names}. Saisissez le nom complet.',
    de: '„{name}“ passt auf mehrere Namen: {names}. Gib den vollständigen Namen ein.',
    es: '«{name}» coincide con varios nombres: {names}. Introduzca el nombre completo.',
  },
  notEnoughStock: {
    en: 'Not enough "{name}" in stock.',
    fr: 'Pas assez de « {name} » en stock.',
    de: 'Nicht genug „{name}“ auf Lager.',
    es: 'No hay suficiente «{name}» en existencias.',
  },
  refused: {
    en: 'Grocy refused: {reason}',
    fr: 'Grocy a refusé : {reason}',
    de: 'Grocy hat abgelehnt: {reason}',
    es: 'Grocy lo ha rechazado: {reason}',
  },
  unknownItem: {
    en: 'This item is no longer due in Grocy: the list was refreshed.',
    fr: "Cet élément n'est plus à faire dans Grocy : la liste a été actualisée.",
    de: 'Dieser Eintrag ist in Grocy nicht mehr fällig: Die Liste wurde aktualisiert.',
    es: 'Este elemento ya no está pendiente en Grocy: la lista se ha actualizado.',
  },
};

export const LANGUAGE_FALLBACK = 'en';

export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];

/** Fill the `{key}` holes of a text. */
export const fill = (text, values) =>
  text.replace(/\{(\w+)\}/g, (hole, key) => (key in values ? String(values[key]) : hole));

/** A multi-language text with its holes filled in every language. */
export const filled = (table, values) =>
  Object.fromEntries(Object.entries(table).map(([lang, text]) => [lang, fill(text, values)]));

/** "Name: text", with the space French puts before a colon. */
export const labelled = (name, text, language) =>
  `${name}${language === 'fr' ? ' : ' : ': '}${text}`;
