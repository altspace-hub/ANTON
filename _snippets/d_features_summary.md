# D Features Summary: Community Features (D1, D2, D3)

## D1: Community Skills Submission

### Files Changed

**`server/db/schema.sql`**
- Added `community_skills` table: id, name, description, category, prompt_instruction, tags, submitted_at

**`server/routes/skills.ts`**
- Added `POST /api/skills/community` — accepts name, description, category, promptInstruction, tags; saves to community_skills table
- Added `GET /api/skills/community` — returns all community skills with parsed tags JSON
- Reordered routes so `/skills/community` is registered before `/skills/:id` to avoid route conflict

**`src/lib/api.ts`**
- Added `fetchCommunitySkills()` — fetches `GET /api/skills/community`
- Added `submitCommunitySkill(data)` — posts to `POST /api/skills/community`

**`src/pages/SkillsLibrary.tsx`**
- Added "Submit a Skill" teal button (+icon) in the page header (top-right)
- Added `SubmitSkillModal` component with fields: Name, Description, Category (select: Analysis/Document/Communication/Research/Technical), Prompt Instruction, Tags (comma-separated)
- Added "Community Skills" section below the main skills list with gold-themed cards
- Community skill cards show "Community" badge in gold, expandable to view prompt instruction
- Loads community skills on mount and refreshes after submission

---

## D2: Community Module Discovery

### Files Changed

**`server/db/init.ts`**
- Added migration: `ALTER TABLE custom_modules ADD COLUMN is_shared_with_community INTEGER DEFAULT 0`

**`server/routes/custom-modules.ts`**
- Added `POST /api/modules/community` — marks a custom module as community-shared (sets is_shared_with_community = 1)
- Added `GET /api/modules/community` — returns all custom modules where is_shared_with_community = 1

**`src/lib/api.ts`**
- Added `shareModuleWithCommunity(moduleId)` — posts to `POST /api/modules/community`
- Added `fetchCommunityModules()` — fetches `GET /api/modules/community`

**`src/pages/BuildYourOwnModule.tsx`**
- In `SaveAsDialog`: Added "Share with Community" checkbox toggle below config summary. When checked, after saving the module, also calls `shareModuleWithCommunity(id)`
- In `BuildWizard` (step 4 — Review & Save): Added same "Share with Community" toggle. When checked and module is saved, also shares with community
- Note shown: "Shared modules are visible to other openEXPERT users on this device"

**`src/pages/Dashboard.tsx`**
- Added state for `communityModules`, fetched from `GET /api/modules/community` on mount
- Added "Community Modules" section on the dashboard (before Recent Sessions) with gold-themed cards
- Cards show Puzzle icon, "Community" badge in gold, link to `/module/[id]`

---

## D3: Cross-Area Projects

### Files Changed

**`server/routes/projects.ts`**
- Updated `GET /api/projects/:id` — sessions query has no area filter; returns sessions from ALL areas with module_id included

**`src/pages/ProjectsPage.tsx`**
- Added `AREA_COLORS` map with dot/text color classes per area (fcp, legal, audit, consulting, banking, risk, cyber, etc.)
- Added `getAreaForModule(moduleId)` helper to resolve area info for any module
- Project cards are now expandable — click the folder icon or project name to expand
- Expanded view loads sessions via `fetchProject(id)` and displays them as a list
- Each session card shows an area badge (colored dot + area shortLabel) using the area's color
- Added expand/collapse button in the project action buttons
