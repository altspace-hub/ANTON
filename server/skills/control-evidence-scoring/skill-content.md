# Control Evidence Scoring — Strong / Adequate / Weak

A control's strength is the most consequential ordinal score in the Atlas because it directly drives the residual reduction (Strong = -2, Adequate = -1, Weak = 0). The temptation to over-state strength is significant — and the audit consequence of doing so is severe. This rubric exists to discipline the call.

## Strong

A control is Strong when ALL of the following are true:

1. **Designed to address the vulnerability.** The control's mechanism actually reduces the specific weakness it claims to cover. (Not "we have transaction monitoring" — "transaction monitoring includes alerts on threshold breaches and structuring patterns relevant to AMLR Annex II.B").
2. **Operates as designed.** It runs at the intended frequency, with the intended scope, by the intended owner. Not aspirational; actual.
3. **Evidence on file.** Specific, dated, retrievable. Examples that count:
   - Sample output (a screenshot of a transaction monitoring alert from the last 30 days)
   - Process output (a sanctions screening hit log with dispositions for the last quarter)
   - Test result (a backup restore test report from the last 90 days)
   - Independent review (a 2LoD or 3LoD finding confirming the control was tested)
   - Regulatory finding (a supervisor's letter confirming adequacy)
4. **Owner identified.** A named person, not a role like "the team". The owner is accountable for the control continuing to work.
5. **Recent.** Evidence is no older than the control's designed cadence (a quarterly control needs evidence from the last quarter; an annual control needs evidence from the last year).

If any of these fail, the control is not Strong. Downgrade to Adequate.

## Adequate

A control is Adequate when:

- The mechanism is in place and operates broadly as designed
- There are known gaps (frequency too low, scope incomplete, evidence patchy, owner accountability informal)
- The user can describe what would close the gaps to reach Strong

Adequate is the honest answer for most real-world controls. A regulator inspecting an Adequate control will ask why it isn't Strong; the user should have a credible answer ("we're moving from quarterly to monthly cadence in Q3, owner change is on the org chart for next month").

## Weak

A control is Weak when ANY of the following are true:

- The mechanism is documented but not actually used (a procedure no one follows)
- It runs ad-hoc when someone remembers (no defined cadence)
- It's owned by "the team" with no individual accountable
- Its evidence is hearsay ("we believe this happens monthly") rather than artefacts
- It addresses the vulnerability incidentally rather than by design
- It has been superseded by a system change but never decommissioned

Weak controls produce zero residual reduction. They occupy space in the Atlas without buying any risk reduction. The right move is usually either to upgrade the control or remove it from the matrix.

## Absent

The path's vulnerabilities have no controls linked at all. Treat as zero reduction.

## Evidence anchors per control class

The Atlas accepts free-text evidence, but a pack can ship anchor lists. A few examples for the SME General pack:

- **MFA control (Strong):** IDP report showing MFA enforced on all admin and finance accounts, dated within 90 days.
- **MFA control (Adequate):** MFA configured on email + banking, but not on cloud admin or IT vendor accounts.
- **MFA control (Weak):** "We use MFA when we remember to."

- **Backup restore (Strong):** Quarterly restore test with named restorer, restored file checksum verified, last test within 90 days, ticket retained.
- **Backup restore (Adequate):** Backups run nightly; last restore test was 9 months ago.
- **Backup restore (Weak):** Backups run; we've never restored from them.

- **Compliance calendar (Strong):** Calendar with named owners and 30/60/90-day reminders, joint-signed by owner + finance, audit-trail of what was filed when.
- **Compliance calendar (Adequate):** Spreadsheet maintained by one person; reminders ad-hoc.
- **Compliance calendar (Weak):** "I keep it in my head."

## Why this rubric is non-negotiable

The Atlas's audit defensibility rests on Strong meaning something. If "Strong" floats with the user's mood, residual scores float, and the appetite statement is fiction. The methodology promises a regulator that residual = inherent − reduction(rollup) and that the rollup is anchored. Honour that promise.

When in doubt, downgrade. A regulator who reads "Adequate, with gaps documented" trusts the institution. A regulator who reads "Strong" with thin evidence does not.
