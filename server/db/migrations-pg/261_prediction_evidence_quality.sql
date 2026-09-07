-- 261_prediction_evidence_quality.sql
--
-- Give the forecaster a second channel, so "this is genuinely a coinflip" and
-- "I found nothing informative" stop being the same number.
--
-- This migration exists because the system diagnosed the need for it. From a
-- root-cause chain completed 26 August 2026:
--
--   "Confidence is a single scalar, which cannot simultaneously encode 'this
--    is genuinely a coinflip' and 'I found no informative evidence' — so
--    evidence quality has no representable channel, and the number necessarily
--    defaults to the unconditional base rate."
--
-- The measurement agrees. In the trusted window the generator's confidence sat
-- at mean 0.561 with a standard deviation of 0.064, and correlated 0.074 with
-- being right across 82 graded predictions — statistically indistinguishable
-- from zero. A scalar with nowhere to put "I don't know" collapses onto the
-- base rate, exactly as the chain predicted.
--
-- Two fields, deliberately separate:
--
--   confidence        P(the stated direction is correct). A claim about the
--                     WORLD. Unchanged in meaning; never overwritten.
--   evidence_quality  How much informative evidence was actually found. A
--                     claim about the INPUTS. 0 = nothing usable was located,
--                     1 = direct, specific, corroborated evidence.
--
-- The pair is what carries the information. confidence 0.55 with
-- evidence_quality 0.9 is a real, well-supported near-coinflip and worth
-- acting on. confidence 0.55 with evidence_quality 0.1 is an abstention
-- wearing a number, and should be filtered out rather than sized down.
--
-- Nothing is backfilled. Predictions made before this column existed have no
-- evidence-quality reading and must stay NULL — inventing one would fabricate
-- a measurement, which is the failure mode this whole line of work exists to
-- correct. Consumers must treat NULL as "unknown", never as zero.

ALTER TABLE market_predictions
  ADD COLUMN IF NOT EXISTS evidence_quality DOUBLE PRECISION;

ALTER TABLE market_predictions
  ADD COLUMN IF NOT EXISTS evidence_basis TEXT;

COMMENT ON COLUMN market_predictions.evidence_quality IS
  'How much informative evidence was found for this call, 0-1. A claim about the inputs, NOT about the world — confidence answers that. NULL = predates the column or was not reported; never treat NULL as 0.';

COMMENT ON COLUMN market_predictions.evidence_basis IS
  'Short free text naming the specific evidence the call rests on, so a low evidence_quality can be audited rather than trusted.';

-- Partial index: consumers filter on "has a usable evidence reading", which is
-- a small slice of the table while historical rows dominate.
CREATE INDEX IF NOT EXISTS idx_market_predictions_evidence_quality
  ON market_predictions (evidence_quality)
  WHERE evidence_quality IS NOT NULL;
