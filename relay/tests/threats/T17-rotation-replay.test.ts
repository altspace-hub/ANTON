/**
 * T17 — Rotation advisory replay.
 *
 * Threat model claim (THREAT_MODEL.md §2 T17):
 *   "Spec §7.1 advisory now includes rotation_epoch (monotonic per instance)
 *    and not_after. Phone tracks max_seen_epoch_per_instance; advisories with
 *    a lower epoch are rejected, advisories past not_after are rejected."
 *
 * NOT TESTABLE AT THE RELAY LAYER.
 *
 * The rotation advisory is an **application-layer** message between the
 * paired instance and the paired phone. It rides inside a Noise transport
 * message — i.e. inside the encrypted ENVELOPE inner — and the relay
 * never sees it (and MUST never see it; that's the whole point).
 *
 * The relay's contribution to T17 is: forward bytes faithfully. That's
 * already covered by T02 (tampering / faithful forwarding tests). The
 * actual replay-protection mechanism (epoch tracking + not_after check)
 * lives in:
 *   - Phase 3 instance-side mesh dialer (issues advisories)
 *   - Phase 4 phone-side mesh transport (verifies advisories + tracks epoch)
 *
 * This file is a documented stub so:
 *   1. The threat-test directory is complete (one file per threat from
 *      THREAT_MODEL.md), making it easy to audit at a glance.
 *   2. A future maintainer who adds an in-spec advisory frame at the
 *      relay layer (e.g. for the v0.2 onion-routed variant) has an
 *      obvious place to put the test.
 *   3. The vitest run includes a "T17" entry confirming the relay tests
 *      are aware of the threat — even if the test body is a no-op.
 */

import { describe, it } from 'vitest';

describe('T17 — rotation advisory replay', () => {
  it.skip('NOT TESTABLE AT RELAY LAYER (application-layer threat) — see Phase 4 phone-side mesh tests', () => {
    // Intentionally blank. See file header.
  });
});
