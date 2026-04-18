# Hardware Engineering — personas (Phase 3)

Per spec §4.1, this directory will contain 9 path-tagged personas:

- `embedded-systems-engineer.md` — default: develop, maintain
- `electronics-engineer.md` — default: develop, diagnose
- `industrial-designer.md` — default: develop
- `reliability-engineer.md` — default: diagnose, maintain, develop
- `safety-engineer.md` — default: develop (safety-critical)
- `clinical-safety-officer.md` — default: develop + maintain (medical-adjacent)
- `field-technician.md` — default: diagnose, maintain
- `humanitarian-tech-operator.md` — default: all paths (humanitarian context)
- `quality-engineer.md` — default: maintain, develop

Each persona markdown file has YAML frontmatter declaring:
- `path_defaults` — which paths the persona is auto-injected into
- `family_applicability` — which hardware families (default: all)
- `activation_triggers` — symptom patterns or regulatory contexts that
  trigger this persona

These personas use the same frontmatter pattern as existing area
personas (`server/areas/cyber/personas/`, `server/areas/coding/personas/`,
etc.). Keep them consistent with the established pattern.
