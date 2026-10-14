# ADR-0006: Host safety rules for v22 work

- Status: accepted
- Applies to: all v22 work (`docs/agent-work/v22/PLAN_MAESTRO_ROG_MONITOR.md`), tests, CI, agents

## Context

The post-90 audit (`docs/audits/post90/`) found no confirmed P0, but several
privileged paths were never exercised for real:

- the installer and TTY recovery were never run in a VM;
- three writers can touch the same hardware attributes (asusd, `rog-profile-sync`
  and the guardian);
- the guardian's power restore can be incomplete (GRD-03);
- `docs/RECOVERY.md` has wrong steps.

v22 changes code near those paths.

## Decision

1. **No privileged action on the owner's host without explicit, per-action
   approval.** This covers `sudo`, `pkexec`, `systemctl enable/start`,
   installers, uninstall, `/sys` writes, reboots and boot configuration. A
   `--dry-run` is read first, never assumed harmless.
2. **Automated tests never write `/sys`, never start systemd units and never
   call the real `pkexec`.** Hardware logic is tested against a fake sysfs tree
   (`ROG_SYSFS_ROOT`), `ROG_PREFIX` installs and mocked runners.
3. **The guardian stays simulation-first** (ADR-0005). It is not enabled in real
   mode until two conditions hold:
   - one owner per attribute is established (plan F7-01/02);
   - restore-on-failure is proven with fakes (F7-04).

   Enabling real mode needs a separate approval from the owner.
4. **Installer and recovery changes are validated in a VM with a snapshot**
   (F1-08/09) before they ship in a release.
5. **Publishing:**
   - Agents push only with explicit owner permission. The v21 baseline push to
     `master` on 2026-10-11 was explicitly ordered by the owner.
   - v22 is published from a release branch through a PR with green remote CI
     (F9-10).
6. A backup bundle is made before any history-touching operation. Its location
   is recorded in `docs/agent-work/v22/checkpoints/F0-02.md`.

## Consequences

- Some checkpoints end as BLOCKED or PARTIAL until the owner runs the manual or VM
  step. That is the intended outcome, not a failure.
- Hardware code needs injectable paths (sysfs root, command runner) so it can be
  tested without root.
