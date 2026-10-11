# ADR-0005: Guardian writes go through one switch; simulate before enabling

- Status: accepted. The simulation mode itself is being added; check
  `scripts/rog-thermal-guardian.sh` and the app for its current state.
- Applies to: `scripts/rog-thermal-guardian.sh`, `systemd/rog-thermal-guardian.service`

## Context

The thermal guardian is a root service that adjusts fan aggression and, in
Protection mode, trims GPU Dynamic Boost and PL2 through firmware attributes.
These are real hardware writes made automatically, without the user pressing
anything. A wrong decision (a bad threshold, a sensor that returns nothing, a
loop that oscillates) shows up as lost performance or noise on the user's
machine, and not every contributor has hardware to test it on.

## Decision

- Every guardian write to sysfs goes through a single function
  (`write_sysfs_int` in the script). There is no other write path, so one
  place decides whether a write happens.
- The guardian gets a simulation mode controlled at that one place: it runs the
  full decision loop, logs the writes it would make, and writes nothing. A new
  or changed policy runs in simulation first and is enabled for real only after
  its decisions have been checked.
- The unit is installed but not enabled. The user turns the guardian on from the
  app, and the app validates the arguments it hands to `rog-ctl.sh`.
- Failure is safe: if temperature cannot be read, the guardian raises fan
  aggression and does not raise power.
- The hard limits in SECURITY.md still apply: the guardian never applies GPU
  clock offsets and never changes the GPU mode.

## Consequences

- Policy changes can be reviewed from logs of decisions before they can touch
  hardware, and a single write function keeps that review small.
- Anyone adding a new kind of automatic write has to route it through the same
  function; a second write path would bypass the switch and is rejected in
  review.
- Simulation shows decisions, not the machine's real thermal response, so a
  policy still needs a supervised real run before it becomes a default.
