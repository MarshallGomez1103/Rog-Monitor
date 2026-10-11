# ADR-0004: Snapshot schema is versioned and changes additively

- Status: accepted
- Applies to: `src/rog_monitor/app.py` (`snapshot_json`), `tests/test_contract.py`, `desktop/test/contract.test.js`, `tests/fixtures/`

## Context

The Python core and the Electron app are separate processes that talk through
one JSON object per line (`--json`, `--json-stream`). They are updated
together, but external widgets and scripts can read the stream too, and the
renderer is a set of independent modules that each read the keys they need. An
unnoticed rename or unit change breaks them silently.

## Decision

- The envelope carries an integer `"schema"` (currently `1`), separate from the
  app `"version"`.
- Bump `schema` only on a breaking change: a key removed or renamed, a type
  changed, or a unit changed.
- Adding keys is not breaking and does not bump the schema. Consumers must
  ignore keys they do not know. Existing list-like records are extended by
  appending fields (for example, `events` entries gained a fifth `ctx` element
  while the first four kept their meaning).
- The keys the UI actually reads are pinned by a contract test against a
  recorded fixture (`tests/fixtures/snapshot-v1.json`), mirrored on the
  JavaScript side. The test lists consumed keys, not every key.

## Consequences

- A breaking change is a deliberate act: bump `schema`, update the required-key
  lists in both contract tests, and record a new fixture. The procedure is in
  CONTRIBUTING.md.
- Removing a key that a widget reads fails CI instead of failing on someone's
  desktop.
- The contract test checks the shape of a real snapshot, so it also catches
  type changes (for example a number turning into a string).
