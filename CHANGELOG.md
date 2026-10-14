# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.1] - 2026-10-14

### Added

- One Gladys device for your Grocy (3.3 or later, over HTTP or HTTPS, with an
  API key), with ten counters: products due soon, past their best-before
  date, expired and below their minimum stock; items on the shopping list;
  chores due today and overdue; batteries to charge; tasks due today and
  overdue. Feature names in French by default, or English, German, Spanish.
- Three dashboard widgets: "Eat first", "To do today" (with a button to mark
  each of the first four chores, tasks or batteries as done) and "Shopping
  list" (with "Add missing products" and an "Add…" form).
- Scene triggers: "A product is about to expire" (due soon, best-before passed,
  expired; once per product and date) and "A chore is overdue".
- Scene actions: consume a product (by name or barcode), add to the shopping
  list (a product or free text), mark a chore as done, mark a battery as
  charged.
- "Test the connection" in the Configuration screen.
- Grocy is read by the integration itself (every 30 s to 5 min), with one small
  request when nothing changed; the counters are sent only when they change.
- Documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-grocy/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/guim31/gladys-grocy/releases/tag/v1.0.1
