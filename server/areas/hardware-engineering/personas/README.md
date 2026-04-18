# Hardware Engineering — personas

Hardware-engineering personas are registered in the **global persona
registry** at `server/personas/`, not in this directory. The
personas-manager loads every directory under `server/personas/` that
contains a `persona.json` + `persona-prompt.md` pair, and uses each
persona's `applicableAreas` array to decide whether it shows up in
the persona picker for a given area.

## The 9 Phase-3 hardware personas (already registered)

| Persona ID | Default paths |
|---|---|
| `embedded-systems-engineer` | Develop, Maintain |
| `electronics-engineer` | Develop, Diagnose |
| `industrial-designer` | Develop |
| `reliability-engineer` | Diagnose, Maintain, Develop |
| `safety-engineer` | Develop (safety-critical) |
| `clinical-safety-officer` | Develop + Maintain (medical-adjacent) |
| `field-technician` | Diagnose, Maintain |
| `humanitarian-tech-operator` | All paths (humanitarian context) |
| `quality-engineer` | Maintain, Develop |

To add another hardware persona:

1. Create `server/personas/{persona-id}/persona.json` with
   `applicableAreas: ["hardware-engineering", ...]`.
2. Create `server/personas/{persona-id}/persona-prompt.md` with the
   Layer 4 perspective text.
3. Restart the server (the persona cache rebuilds on first read).

## Cross-area persona injection

Per `area-context.md`, hardware sessions also pull experts from
neighbouring areas (cybersecurity, software engineering, data &
analytics, FCP/legal, healthcare). This works automatically as long
as the relevant persona's `applicableAreas` includes
`hardware-engineering`. Phase 3 widened the applicable-areas of the
key cyber, coding, data, legal, and healthcare personas to include
the hardware area; future phases can refine this with path/family
defaults.
