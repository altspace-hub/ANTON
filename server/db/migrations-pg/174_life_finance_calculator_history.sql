-- 174_life_finance_calculator_history.sql — saved calculator runs +
-- packing-list templates for the Life pillar.
--
-- Phase B.3 build-out continued. Two small Life-area additions:
--   1) finance_calculator_runs — saves the inputs + outputs of a
--      calculator run so a user can revisit a "scenario" later.
--   2) travel_packing_templates — climate + duration parameterised
--      packing-list templates the user can duplicate into a real list.

CREATE TABLE IF NOT EXISTS finance_calculator_runs (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL DEFAULT 'default',
  calculator    TEXT NOT NULL,        -- 'compound' / 'fire' / 'mortgage' / 'avalanche' / 'snowball' / 'required_monthly'
  label         TEXT,
  inputs        JSONB NOT NULL,
  outputs       JSONB NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS finance_calculator_runs_user_idx
  ON finance_calculator_runs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS finance_calculator_runs_calc_idx
  ON finance_calculator_runs(calculator);

-- Travel packing templates: parameterised by climate band + duration band.
-- The travel_packing_lists table (mig 172) holds *user* lists; this table
-- holds *templates* a user can clone.

CREATE TABLE IF NOT EXISTS travel_packing_templates (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  climate         TEXT NOT NULL CHECK (climate IN ('tropical','temperate','cold','mixed')),
  duration_band   TEXT NOT NULL CHECK (duration_band IN ('short','medium','long')),  -- ≤5 / 6–14 / 15+
  bag_size        TEXT NOT NULL CHECK (bag_size IN ('cabin','medium','large')),
  items           JSONB NOT NULL,
  is_active       BOOLEAN DEFAULT TRUE
);

INSERT INTO travel_packing_templates (id, name, description, climate, duration_band, bag_size, items) VALUES
  ('tmpl_pack_tropical_short_cabin',
   'Tropical · short trip · cabin',
   'Beach / city break in warm weather, cabin-bag only.',
   'tropical', 'short', 'cabin',
   '["3 t-shirts","2 shorts","1 light dress / shirt","swimwear","flip-flops","sunscreen SPF 50","sunglasses","reusable water bottle","power adapter","phone charger","passport","insurance card","prescription meds"]'::jsonb),

  ('tmpl_pack_temperate_medium_medium',
   'Temperate · 6–14 days · medium',
   'Standard 1-week city trip in mild weather.',
   'temperate', 'medium', 'medium',
   '["5 t-shirts / shirts","2 trousers","1 light jacket","1 sweater","walking shoes","1 smart pair shoes","umbrella","sunscreen","power adapter","laptop + charger","phone charger","prescription meds"]'::jsonb),

  ('tmpl_pack_cold_long_large',
   'Cold · 15+ days · large',
   'Winter travel for 2+ weeks.',
   'cold', 'long', 'large',
   '["thermal base layer x2","fleece / wool sweater x2","insulated jacket","waterproof shell","wool socks x5","gloves","beanie","scarf","insulated boots","walking shoes","trousers x3","shirts x5","power adapter","laptop + charger","prescription meds","first-aid kit"]'::jsonb)
ON CONFLICT (id) DO NOTHING;
