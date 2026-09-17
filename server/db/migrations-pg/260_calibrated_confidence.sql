-- Calibrated confidence, alongside the stated one — never replacing it.
--
-- market_confidence_calibration has measured per-bucket accuracy for months and
-- nothing has ever read it back into a prediction: the intelligence service
-- exposes a getter, anton-bundler exports the rows, and there the loop ends.
-- That is how confidence came to be ANTI-correlated with being right without
-- anything intervening — over 174 graded predictions the 0.4–0.6 band runs at
-- 54.4% while 0.6–0.8 runs at 34.7%.
--
-- The calibrated value gets its own column on purpose. `confidence` is the only
-- record of what the model actually believed at the time, and the question this
-- whole exercise exists to answer — is calibration improving? — cannot be asked
-- once that number has been overwritten in place. Keeping both lets the same
-- prediction be scored twice and the two Brier scores compared.
--
-- NULL means "no calibrated view": either the prediction predates this, or its
-- confidence band has too few graded examples to speak for itself. NULL is not
-- a failure state and must not be defaulted to `confidence`, or the comparison
-- silently becomes a comparison of a column with itself.

ALTER TABLE market_predictions ADD COLUMN IF NOT EXISTS calibrated_confidence DOUBLE PRECISION;

COMMENT ON COLUMN market_predictions.calibrated_confidence IS
  'Observed accuracy of this prediction''s stated-confidence band, shrunk toward the base rate by sample size. NULL when the band has too little evidence. Never overwrites confidence.';
