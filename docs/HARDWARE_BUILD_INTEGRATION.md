# Hardware Build — Integration Guide

For developers extending or operating the Hardware Build pillar. Companion
to `HARDWARE_BUILD_USER_GUIDE.md` (end-user walkthrough) and
`HARDWARE_BUILD_ROADMAP.md` (implementation plan).

---

## 1. Adding a real quality adapter

The pipeline lives at `server/services/quality-pipeline-service.ts`. The
canonical contract is:

```ts
export interface QualityAdapter {
  gateKey: string;          // unique, kebab-case
  displayLabel: string;
  isMandatory: boolean;     // any mandatory fail → ship_verdict=block
  kind: 'mock' | 'real';
  version: string;
  appliesTo(project: HardwareProject): boolean;
  run(ctx: QualityAdapterContext): Promise<QualityAdapterResult>;
}
```

Every adapter file under `server/services/quality-adapters/` exports a default
`QualityAdapter` AND a named `detect()` function:

```ts
export async function detect(): Promise<{ installed: boolean; version: string | null; install_hint: string }>;
```

To add a new gate:

1. Create `server/services/quality-adapters/your-tool-adapter.ts`. Use
   `_shared.ts` for `execFileP`, `detectToolVersion`, `workspacePathFor`,
   `pathExists` helpers.
2. Implement `detect()` — return `{ installed: false, install_hint: '…' }`
   when the tool is missing. **Never throw** from detect; the registry runs
   them in parallel and surfaces the install hint to the UI.
3. Implement the default-exported `QualityAdapter`. In `run()`, call
   `detect()` first. If not installed, return `outcome='skip'` with the
   install hint as `summary` + `details.install_hint`.
4. Register the adapter in `quality-pipeline-service.ts`:
   - Add it to the `ADAPTERS` array
   - Add its `detect` to `ADAPTER_DETECT`

The UI's adapter availability panel (`HardwareProjectPage`) will pick it up
automatically.

### Reference: PlatformIO adapter end-to-end

```ts
import { execFileP, detectToolVersion, workspacePathFor, pathExists } from './_shared.js';

export async function detect() {
  const version = await detectToolVersion('pio');
  return { installed: version !== null, version, install_hint: 'Install via: pip install -U platformio' };
}

const platformioBuildAdapter: QualityAdapter = {
  gateKey: 'platformio-build',
  // …
  run: async ({ project }) => {
    const det = await detect();
    if (!det.installed) return { outcome: 'skip', score: null, summary: 'PlatformIO not installed', /*…*/ };
    const workspace = workspacePathFor(project);
    if (!(await pathExists(`${workspace}/platformio.ini`))) {
      return { outcome: 'skip', /*…*/ };
    }
    const { stdout, stderr } = await execFileP('pio', ['run', '--project-dir', workspace], { timeout: 600_000 });
    // parse output, return outcome + score + details
  },
};
```

---

## 2. Workspace conventions

Each hardware project has a workspace path:

```
${WORKSPACES_DIR:-./workspaces}/hw/${project_id}/
```

Override per-project via `project.metadata.workspace_path`. Adapters call
`workspacePathFor(project)` to resolve it.

What lives in the workspace:

| Path | Used by |
|---|---|
| `platformio.ini` | platformio-build adapter |
| `src/`, `main/` | clang-tidy adapter (C/C++ source files) |
| `sdkconfig` (or `sdkconfig.defaults`) | security-scorecard adapter |
| `wokwi.toml` + `diagram.json` + `wokwi-tests/*.test.yaml` | wokwi-sim adapter |
| `.anton-sbom.json` | cyclonedx-sbom adapter output (gitignore) |

---

## 3. AAP store-and-forward — wiring to real Companion App pairings

The `aap-store-and-forward` delivery channel on Maintain rollouts dispatches
`app_checkpoints` to the project owner's paired phone via
`server/services/aap-rollout-bridge.ts`.

### Today's lookup (approximate)

```sql
SELECT cu.id AS connected_user_id, cuo.org_id
FROM connected_users cu
LEFT JOIN connected_user_orgs cuo ON cuo.connected_user_id = cu.id
WHERE cu.id = ? OR cu.display_name = ?
ORDER BY cuo.joined_at DESC NULLS LAST
LIMIT 1
```

Project `owner_id` is matched against `connected_users.id` or `display_name`.
Production deployments should add an explicit mapping table:

```sql
CREATE TABLE hw_project_owner_aap_mapping (
  project_owner_id    TEXT PRIMARY KEY,
  connected_user_id   TEXT NOT NULL REFERENCES connected_users(id) ON DELETE CASCADE,
  org_id              TEXT NOT NULL REFERENCES org_profiles(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

…and update `findPairedPhone()` to consult that table first.

### What gets sent

The dispatched `app_checkpoint` payload includes:

```json
{
  "kind": "hardware-patch-rollout",
  "project_id": "…",
  "stage_id": "…",
  "device_count": 5,
  "rollback_artefact_ref": "sha256:…",
  "instructions": "Tap Approve to mark this rollout queued. The actual flash happens on your bench when devices are in hand."
}
```

The phone-side approval triggers `applyApprovalDecision()` which transitions
`hw_patch_rollouts.status` from `queued` to `sent` (or `rolled_back` on
reject). Wire this to your Companion App's checkpoint-response handler.

---

## 4. Lifecycle feed ingestor (CVE pipeline)

`server/services/lifecycle-feed-ingestor.ts` pulls from three sources and
populates `lifecycle_events`:

| Source | Endpoint | Auth |
|---|---|---|
| NVD | `https://services.nvd.nist.gov/rest/json/cves/2.0` | No (rate-limited; chunked into 120-day windows) |
| GHSA | `https://api.github.com/advisories` | Optional `GITHUB_TOKEN` for higher rate limit |
| Espressif | `https://api.github.com/repos/espressif/{esp-idf,arduino-esp32}/security-advisories` | Optional `GITHUB_TOKEN` |

Trigger manually:
```bash
curl -X POST localhost:3001/api/hardware/lifecycle-feeds/run \
  -H 'Content-Type: application/json' \
  -d '{"family_id":"esp32","lookback_days":365}'
```

Or schedule via cron pattern (see `server/services/regulatory-radar.ts` for
reference; plug in the same way).

---

## 5. Review queue — adding a new submission kind

`server/services/review-queue-service.ts` has a fixed enum:

```ts
type SubmissionKind = 'hkp' | 'diagnostic-case' | 'template' | 'patch-bundle';
```

To add a new kind (e.g. `hardware-template-pack`):

1. Migration: extend the `CHECK` constraint on `hw_community_review_queue.submission_kind`
2. Add the kind to the `SubmissionKind` type in the service
3. In `fetchSourceContent()`, add a case that returns `{ content, family_id }` for the new kind
4. In `promoteApproved()`, add the promotion logic (e.g. set authoritative on the source row)
5. In `submit()`, decide whether the new kind requires `security_review_required`

The route + UI pick up the new kind automatically.

---

## 6. Regulatory pack — adding a new artefact kind

`server/services/regulatory-pack-service.ts` has a fixed registry:

```ts
const ARTEFACT_REGISTRY: ArtefactRequirement[] = [ /* 8 entries */ ];
```

To add a 9th artefact (e.g. `nis2-incident-reporting-policy`):

1. Migration: extend `hw_regulatory_artefacts.kind` CHECK constraint
2. Add to `ArtefactKind` type in the service
3. Add to `ARTEFACT_REGISTRY` with required_for_tier + required_when
4. Implement `generateXxx(ctx: GeneratorContext): string` and add to `generateForKind()`
5. The quality gate + UI pick it up automatically

---

## 7. Capacity-transfer (humanitarian) — adding a new artefact kind

Same shape as regulatory:

`server/services/humanitarian-service.ts` has `CAPACITY_ARTEFACT_REGISTRY`.

1. Migration: extend `hw_capacity_transfer_artefacts.kind` CHECK constraint
2. Add to `CapacityArtefactKind` type
3. Add to `CAPACITY_ARTEFACT_REGISTRY` with title + purpose + sections
4. The Claude-localized generator uses the section list automatically — no
   per-kind code needed unless you want bespoke prompt tweaks

---

## 8. Templates — adding a curated template

Two paths:

**Migration-based (authoritative=true):** add to `server/db/migrations-pg/14X_*.sql`
following the pattern in `143_esp32_seed_templates.sql`. Set `authoritative=true`
and `signed_by='anton-hardware-team'`.

**API-based (authoritative=false; needs review):** capture from a working project:
```bash
curl -X POST localhost:3001/api/hardware/projects/${PROJECT_ID}/capture-template \
  -H 'Content-Type: application/json' \
  -d '{"template_id":"esp32-my-thing","title":"My Thing","short_description":"…"}'
```
Then submit it to the review queue:
```bash
curl -X POST localhost:3001/api/hardware/review-queue/submit \
  -H 'Content-Type: application/json' \
  -d '{"kind":"template","source_id":"esp32-my-thing","summary":"…"}'
```

---

## 9. HKP three-layer schema reference

Specification layer (migrations 133, 135, 141):
- `hardware_knowledge_packs` — top-level pack
- `hkp_claims` — per-claim provenance (`datasheet-verified` / `community-verified` / `physically-verified` / `AI-unverified`)
- `hkp_components` — peripherals + pin clusters
- `hkp_regional_alternatives` — region + counterfeit-risk-graded sourcing

Diagnostic layer (migrations 133, 134, 137):
- `diagnostic_cases` — community + ANTON-curated cases (case_data JSONB has symptoms / probable_causes / resolutions / diagnostic_questions)
- `diagnostic_case_outcomes` — every recorded resolution attempt
- `diagnostic_case_cross_references` — "see also" relationships

Lifecycle layer (migration 133, populated by lifecycle-feed-ingestor):
- `lifecycle_events` — security advisories + EOL + recalls
- `lifecycle_event_project_impacts` — per-project applicability tracking

Layer 6 of the prompt-builder calls `buildHardwareHkpLayer()` to inject the
HKP into the model's context, ordered by path:
- diagnose: diagnostic > spec > lifecycle
- maintain: lifecycle > spec > diagnostic
- develop: spec > lifecycle > diagnostic

---

## 10. Environment variables

| Variable | Purpose |
|---|---|
| `WORKSPACES_DIR` | Where project workspaces live (default `./workspaces`) |
| `ANTHROPIC_API_KEY` | Required for: photo-id, capacity-transfer Claude localization, extend-device proposal |
| `WOKWI_CLI_TOKEN` | Required for the wokwi-sim adapter to call the real CLI |
| `GITHUB_TOKEN` | Optional; raises lifecycle-feed-ingestor rate limit |

Adapters that depend on missing env vars or absent CLI tools **skip gracefully**
with a clear install hint surfaced in the UI.
