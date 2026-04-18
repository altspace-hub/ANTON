# Hardware Engineering — modules (Phase 3+)

Per spec §4.3, this directory will contain modules tagged with applicable
paths. Modules are grouped by their primary path:

## Develop-oriented

- `hardware-component-selection`
- `firmware-architecture-design`
- `wiring-diagram-generation`
- `bom-optimisation`
- `assembly-instruction-generation`
- `hardware-test-plan-design`
- `deployment-guide-generation`
- `extend-existing-device-workflow`
- `training-material-generation`
- `field-deployment-planning`
- `regulatory-pathway-advisory`
- `tco-analysis-deployment-context`

## Diagnose-oriented

- `symptom-capture-and-characterisation`
- `diagnostic-hypothesis-generation`
- `diagnostic-decision-tree-navigation`
- `test-execution-guidance`
- `resolution-verification`
- `diagnostic-case-synthesis`

## Maintain-oriented

- `patch-need-identification`
- `patch-impact-assessment`
- `patch-planning-and-staging`
- `patch-application-guidance`
- `regression-verification`
- `patch-documentation-and-audit-trail`
- `fleet-rollout-coordination`
- `cve-applicability-assessment`

## Cross-path

- `troubleshooting-diagnostic-tree` (shared by all three paths)
- `repair-workflow` (maintain, sometimes diagnose)
- `hardware-document-inbox` (all paths)

Each module is a directory with the standard module structure
(`module.json`, `system-prompt.md`, `description.md`). Path tagging in
`module.json` controls which path workflows surface the module.
