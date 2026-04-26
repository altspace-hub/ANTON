# Extending School

> How to add a new role, a new page, a new curriculum jurisdiction, or a new safeguarding rule.

---

## Add a new role

The current set is Guardian / Teacher / Student. To add a fourth (e.g. School Admin, External Auditor):

1. **Define the role identifier** — kebab-case string used in `users.role_title` or a new `school_role` field.
2. **Update auth middleware** — `server/middleware/auth.ts` plus `routes/school.ts` `requireSchoolRole(...)` helper.
3. **Add per-role pages** — under `src/pages/school/` with the role prefix (e.g. `AdminDashboardPage.tsx`).
4. **Update the role-aware Dashboard router** — `SchoolDashboardPage` switches on role to land the user on the right surface.
5. **Update the safeguarding model** — does the new role need additional guardian approvals? Does it bypass any consent gates?
6. **Document in [`README.md`](README.md)** — add to the page-layout table.

---

## Add a new page

1. Create the `.tsx` file under `src/pages/school/`.
2. Register the route in `src/App.tsx` (lazy-loaded, under the `/school/...` path prefix).
3. If the page needs new backend, add to `server/routes/school.ts` (or a new sub-route file under `server/routes/school-*.ts`).
4. If the page surfaces guardian-visible data, ensure the underlying query filters on `student_user_id` (cross-student isolation).
5. Update [`README.md`](README.md) page layout table.

---

## Add a new curriculum jurisdiction

The `curriculum_registry` table (mig 168) currently seeds 5 countries (SE / UK / US / IN / KE). To add a 6th:

1. **Identify** the canonical national-curriculum publication URL.
2. **Choose** an objective-code naming convention (`<country>-<jurisdiction?>-<subject>-<year>-<topic>`).
3. **Add seed rows** to a new migration:

```sql
INSERT INTO curriculum_registry (
  id, country_code, jurisdiction, subject, year_level,
  learning_objective_code, learning_objective_text, source_url
) VALUES
  ('seed-fr-math-7', 'FR', NULL, 'mathematics', 'collège-cinquième', 'FR-MATH-C5-FRAC',
   'Opérer avec les fractions, décimaux et pourcentages...', 'https://eduscol.education.fr/...'),
  -- … more rows
ON CONFLICT (country_code, jurisdiction, subject, year_level, learning_objective_code) DO NOTHING;
```

4. **Ship as a `.anton regulatory-knowledge-pack` bundle** — a published curriculum pack that other ANTON instances can import. Bundle type #22 already supports this pattern.

5. Update `/docs/marketing/school.md` to list the new country in the seeded count.

---

## Add a new safeguarding rule

Don't bypass — extend.

1. **Identify the layer** the rule sits at (prompt overlay / consent gate / content filter / isolation / trail).
2. **For prompt overlay** — extend `school-prompt-builder.ts` with the new directive. It will apply to every school-mode session.
3. **For consent gate** — define the action that requires approval and add a write to `guardian_approvals` before execution. Update [`safeguarding.md`](safeguarding.md) "what requires approval" table.
4. **For content filter** — extend the streaming-layer filter with the new category.
5. **For isolation** — every new query that touches per-student data must filter on `student_user_id` AND verify viewer permission.
6. **For trail** — every new write must emit an Evidence Log row OR a reasoning-trail entry.

The rule MUST work in offline mode (no network). Rules that depend on cloud calls don't belong in the safeguarding layer.

---

## Add a new lesson template

Lesson templates are user-authored via `LessonBuilderPage`. To ship a template as a built-in:

1. Author the lesson in the UI.
2. Export as a `.anton lesson-plan` bundle (bundle type #19).
3. Drop into `data/school/lesson-templates/` (or wherever the seed loader picks it up).
4. Reference in the school onboarding flow.

---

## Add an offline / humanitarian curriculum pack

For NGO field deployments without internet:

1. Build the curriculum-registry rows for the deployment country.
2. Build the lesson + assessment-bank bundles (`lesson-plan`, `assessment-bank` bundle types).
3. Combine into a `.anton humanitarian-deployment-kit` bundle (bundle type #37) — pre-loaded ANTON + Ollama + curricula.
4. Sign with the issuing org's instance Ed25519 key.
5. Ship to the field deployment hardware.

See [`/docs/marketing/humanitarian-deployment-kit.md`](../marketing/humanitarian-deployment-kit.md).

---

## Anti-patterns

- **Don't add a "skip safeguarding" flag.** Safeguarding either applies or the session isn't a school-mode session.
- **Don't auto-approve guardian gates** — even for "low-risk" actions. The guardian's choice is the wedge.
- **Don't write directly to the Evidence Log** — go through `routes/school-evidence.ts` so the audit trail is consistent.
- **Don't bypass cross-student isolation.** Even for teachers viewing aggregate data — filter at the query layer, not the UI layer.

---

*Maintained alongside the School pillar. Refresh when a new role ships, a new safeguarding layer is added, or a new curriculum jurisdiction lands.*
