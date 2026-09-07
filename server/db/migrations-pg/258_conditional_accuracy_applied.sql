-- 258_conditional_accuracy_applied.sql
--
-- Makes the conditional-accuracy roll-up idempotent.
--
-- Step 5.7 of the validation workflow re-scans every prediction validated in
-- the last 7 days and increments market_conditional_accuracy for each of its
-- features. Nothing recorded that a prediction had already been counted, so a
-- workflow running more often than weekly would count the same outcome again
-- on every pass — inflating `total`, dragging `accuracy` toward whatever the
-- most-rescanned rows said, and doing it silently.
--
-- It has not bitten yet only because the roll-up has barely run: the table
-- holds two rows with total = 1 apiece against 126 graded predictions. Fixing
-- the feature capture is what makes this loop actually turn, so the guard has
-- to land with it rather than after.

CREATE TABLE IF NOT EXISTS market_conditional_accuracy_applied (
  prediction_id TEXT PRIMARY KEY,
  scope         TEXT NOT NULL DEFAULT 'live',
  applied_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The roll-up asks "which of these have I not counted yet" per scope.
CREATE INDEX IF NOT EXISTS idx_cond_acc_applied_scope
  ON market_conditional_accuracy_applied (scope, applied_at);

-- The two existing aggregate rows were built from a single prediction each,
-- and there is no record of which. Leaving them would double-count that one
-- outcome the first time the fixed roll-up runs. Two rows of total = 1 are
-- worth nothing, so reset them rather than carry an unresolvable ambiguity —
-- getConditionalAccuracy suppresses anything under 3 observations anyway, so
-- nothing downstream can tell the difference.
DELETE FROM market_conditional_accuracy WHERE scope = 'live' AND total <= 1;
