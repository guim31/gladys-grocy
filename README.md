# Grocy for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) integration for
[Grocy](https://grocy.info), the self-hosted groceries and household
management solution: what must be eaten first, the chores of the day, the
shopping list and the batteries to charge, on the Gladys dashboard and in its
scenes. It talks to the REST API of your own Grocy over the local network.

> **Developed without the hardware: feedback welcome.** No running Grocy was
> available while this integration was written: it is built on Grocy's OpenAPI
> specification and its PHP rules, and tested against real answers of a Grocy
> 3.3.1 recorded by pygrocy and an in-memory Grocy 4.7. Please report anything
> that does not work in the
> [issues](https://github.com/guim31/gladys-grocy/issues).

## Features

- **One device** for your Grocy, with ten counters (history kept): products due
  soon, past their best-before date, expired, below their minimum stock; items
  on the shopping list; chores due today and overdue; batteries to charge;
  tasks due today and overdue.
- **Three dashboard widgets**: _Eat first_ (the most urgent products), _To do
  today_ (chores, tasks and batteries, with a one-tap "done" button for the
  first four) and _Shopping list_ (with _Add missing products_ and an _Add…_
  form).
- **Two scene triggers**: _A product is about to expire_ (once per product and
  date: due soon, best-before passed, expired), _A chore is overdue_.
- **Four scene actions**: consume a product (by name or barcode), add to the
  shopping list (a product or free text), mark a chore as done, mark a battery
  as charged. Everything they do is undone from Grocy; nothing is deleted.
- English, French, German and Spanish everywhere (feature names, widgets,
  messages, documentation).

## Requirements

- Gladys Assistant **5.2.0** or later (the _Add…_ form of the shopping list
  widget needs it).
- **Grocy 3.3 or later** (Grocy 4 recommended), reachable from Gladys over
  HTTP or HTTPS (a self-signed certificate is accepted on option), with an
  **API key** (Grocy → user menu → _Manage API keys_).

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter the
   address of this repository: `https://github.com/guim31/gladys-grocy` (or
   install **Grocy** from the catalog once it is listed).
2. In **Configuration**, enter the address of Grocy (`http://192.168.1.10:9283`,
   or `https://nas.example.com/grocy` for a sub-directory) and the API key.
   Save, then click **Test the connection**.
3. Open the **Discover** tab and add the **Grocy** device.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

- **Polling of its own.** The device is published with `should_poll: false`:
  Gladys does not reliably poll the devices of external integrations
  (GladysAssistant/Gladys#3198), so the container reads Grocy on its own timer
  (30 s to 5 min, 1 min by default), `onPoll` staying as a fallback.
- **Light on Grocy.** Each cycle asks `GET /api/system/db-changed-time`; the
  lists (`/stock/volatile`, `/chores`, `/batteries`, `/tasks`,
  `/objects/shopping_list`, `/objects/products`) are read again only when the
  database changed, when the day changed, or every 15 minutes. What is due is
  recomputed each cycle from the last reading and the server's own clock
  (`/api/system/time`), with the rules of the Grocy interface. Grocy sets no
  request quota.
- **Quiet.** States are sent only when they change (and every 6 hours as a
  heartbeat); the info log holds the lifecycle only; the API key never reaches
  the logs.
- **Scene events once.** What is due at the very first start is taken as known;
  the products and chores announced afterwards are kept in `/data`, so a
  restart does not announce them again.

## Limitations

- One Grocy per Gladys, one shopping list (chosen in the configuration).
- Product, chore and battery names are typed in the scenes (Gladys offers no
  dynamic list of them).
- The integration acts as the user who owns the API key.
- Amounts in scene actions are whole numbers (stock unit of the product).
- Recipes, meal plans and equipment are not covered.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests use the fake Gladys of the SDK
(`@gladysassistant/integration-sdk/testing`) and an in-memory Grocy
(`test/helpers/fakeGrocy.js`); real recorded answers live in
`test/fixtures/grocy/`. Against a real Grocy (a test instance: the test
creates a product, a chore and a battery there):

```bash
GROCY_URL=http://192.0.2.10:9283 GROCY_API_KEY=... npm run test:real
GROCY_URL=http://192.0.2.10:9283 GROCY_API_KEY=... node scripts/probe.mjs   # read-only
```

See [`CLAUDE.md`](CLAUDE.md) for the project rules.

## Releasing

Versions belong to the Release workflow: describe your changes under
`## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md), then **Actions → Release →
Run workflow**. It bumps `package.json` and the manifest (`version`,
`docker_image`), rolls the changelog, tags, builds the multi-arch image and
creates the GitHub Release.

A hand-pushed tag (`git tag v1.2.3 && git push --tags`) builds the image too,
but does not edit the manifest: bump `version` in `package.json` and in the
manifest, and the `docker_image` tag, together and commit them **before**
tagging, or the store keeps serving the old version.

## Credits

- [Grocy](https://github.com/grocy/grocy) by Bernd Bestel and contributors
  (MIT): the OpenAPI specification of the API, and the due-date rules of its
  interface, re-implemented here.
- [pygrocy](https://github.com/SebRut/pygrocy) by Sebastian Rutofski and
  contributors (MIT): the real Grocy answers recorded by its tests, used as
  fixtures.
- The Home Assistant custom integration
  [`custom-components/grocy`](https://github.com/custom-components/grocy)
  (Apache-2.0): the choice of sensors and services.
- The architecture and the conformity tests follow
  [gladys-pihole](https://github.com/guim31/gladys-pihole) and
  [gladys-wled](https://github.com/guim31/gladys-wled).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by the Grocy
project. "Grocy" belongs to its authors.

## License

Apache-2.0
