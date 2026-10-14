# Grocy fixtures

## `pygrocy/`: real answers of a Grocy 3.3.1

Recorded by the tests of [pygrocy](https://github.com/SebRut/pygrocy) (MIT
licence, © 2019 Sebastian Rutofski) with vcrpy, against a Grocy 3.3.1 in demo
mode on `localhost`, in April 2022 (`test/cassettes/` of that repository).
Extracted as is, one answer per file: `method`, `path`, `request`, `status`,
`body`, and the cassette it comes from (`source`).

They are the demo household of Grocy: no personal data, no address. Grocy 3
sends nearly every number as a string ("5", "1.0"): `test/model.test.js` reads
them with the same parser as the Grocy 4 answers.

## Grocy 4: the fake server

`test/helpers/fakeGrocy.js` answers like Grocy 4.7 (numbers as numbers, the
battery object inside `/batteries`), following the OpenAPI specification
shipped with Grocy (`grocy.openapi.json` of
[grocy/grocy](https://github.com/grocy/grocy), MIT) and the rules of its PHP
code (due soon, overdue, expired, missing products, next execution of a chore).
Its data is the same demo household, moved to dates around the test clock.

No running Grocy was available to the development session (its dependencies
could not be installed there): `scripts/probe.mjs` checks a real one, read-only,
and can save its answers (names masked) to add Grocy 4 recordings here.
