-- PostgreSQL table partitioning for high-growth market tables
-- Replaces the SQLite no-op migration 057.
-- Uses RANGE partitioning by date columns for efficient time-based queries.

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. market_data_raw — monthly partitions by fetched_at                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DO $$ BEGIN
  -- Only partition if table exists and is not already partitioned
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'market_data_raw' AND table_type = 'BASE TABLE')
     AND NOT EXISTS (SELECT 1 FROM pg_partitioned_table pt JOIN pg_class c ON pt.partrelid = c.oid WHERE c.relname = 'market_data_raw')
  THEN
    ALTER TABLE market_data_raw RENAME TO market_data_raw_old;

    CREATE TABLE market_data_raw (
      id TEXT NOT NULL,
      source_id TEXT,
      data_type TEXT,
      symbol TEXT,
      raw_content TEXT,
      parsed_data TEXT,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      processed INTEGER DEFAULT 0,
      PRIMARY KEY (id, fetched_at)
    ) PARTITION BY RANGE (fetched_at);

    -- Create monthly partitions: 2025-01 through 2027-12
    CREATE TABLE market_data_raw_2025q1 PARTITION OF market_data_raw FOR VALUES FROM ('2025-01-01') TO ('2025-04-01');
    CREATE TABLE market_data_raw_2025q2 PARTITION OF market_data_raw FOR VALUES FROM ('2025-04-01') TO ('2025-07-01');
    CREATE TABLE market_data_raw_2025q3 PARTITION OF market_data_raw FOR VALUES FROM ('2025-07-01') TO ('2025-10-01');
    CREATE TABLE market_data_raw_2025q4 PARTITION OF market_data_raw FOR VALUES FROM ('2025-10-01') TO ('2026-01-01');
    CREATE TABLE market_data_raw_2026q1 PARTITION OF market_data_raw FOR VALUES FROM ('2026-01-01') TO ('2026-04-01');
    CREATE TABLE market_data_raw_2026q2 PARTITION OF market_data_raw FOR VALUES FROM ('2026-04-01') TO ('2026-07-01');
    CREATE TABLE market_data_raw_2026q3 PARTITION OF market_data_raw FOR VALUES FROM ('2026-07-01') TO ('2026-10-01');
    CREATE TABLE market_data_raw_2026q4 PARTITION OF market_data_raw FOR VALUES FROM ('2026-10-01') TO ('2027-01-01');
    CREATE TABLE market_data_raw_2027q1 PARTITION OF market_data_raw FOR VALUES FROM ('2027-01-01') TO ('2027-04-01');
    CREATE TABLE market_data_raw_2027q2 PARTITION OF market_data_raw FOR VALUES FROM ('2027-04-01') TO ('2027-07-01');
    CREATE TABLE market_data_raw_2027q3 PARTITION OF market_data_raw FOR VALUES FROM ('2027-07-01') TO ('2027-10-01');
    CREATE TABLE market_data_raw_2027q4 PARTITION OF market_data_raw FOR VALUES FROM ('2027-10-01') TO ('2028-01-01');
    CREATE TABLE market_data_raw_default PARTITION OF market_data_raw DEFAULT;

    -- Copy existing data
    INSERT INTO market_data_raw SELECT * FROM market_data_raw_old;
    DROP TABLE market_data_raw_old;

    CREATE INDEX idx_market_data_raw_fetched ON market_data_raw (fetched_at);
    CREATE INDEX idx_market_data_raw_source ON market_data_raw (source_id);
  END IF;
END $$;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. market_atoms — monthly partitions by created_at                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'market_atoms' AND table_type = 'BASE TABLE')
     AND NOT EXISTS (SELECT 1 FROM pg_partitioned_table pt JOIN pg_class c ON pt.partrelid = c.oid WHERE c.relname = 'market_atoms')
  THEN
    ALTER TABLE market_atoms RENAME TO market_atoms_old;

    CREATE TABLE market_atoms (
      id TEXT NOT NULL,
      atom_type TEXT NOT NULL,
      category TEXT,
      content TEXT NOT NULL,
      source TEXT,
      source_url TEXT,
      confidence NUMERIC(10,6) DEFAULT 0.5,
      sentiment TEXT DEFAULT 'neutral',
      entities JSONB DEFAULT '[]',
      affected_symbols JSONB DEFAULT '[]',
      metadata JSONB DEFAULT '{}',
      valid_until TIMESTAMPTZ,
      decay_rate NUMERIC(10,6) DEFAULT 0.01,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (id, created_at)
    ) PARTITION BY RANGE (created_at);

    CREATE TABLE market_atoms_2025q1 PARTITION OF market_atoms FOR VALUES FROM ('2025-01-01') TO ('2025-04-01');
    CREATE TABLE market_atoms_2025q2 PARTITION OF market_atoms FOR VALUES FROM ('2025-04-01') TO ('2025-07-01');
    CREATE TABLE market_atoms_2025q3 PARTITION OF market_atoms FOR VALUES FROM ('2025-07-01') TO ('2025-10-01');
    CREATE TABLE market_atoms_2025q4 PARTITION OF market_atoms FOR VALUES FROM ('2025-10-01') TO ('2026-01-01');
    CREATE TABLE market_atoms_2026q1 PARTITION OF market_atoms FOR VALUES FROM ('2026-01-01') TO ('2026-04-01');
    CREATE TABLE market_atoms_2026q2 PARTITION OF market_atoms FOR VALUES FROM ('2026-04-01') TO ('2026-07-01');
    CREATE TABLE market_atoms_2026q3 PARTITION OF market_atoms FOR VALUES FROM ('2026-07-01') TO ('2026-10-01');
    CREATE TABLE market_atoms_2026q4 PARTITION OF market_atoms FOR VALUES FROM ('2026-10-01') TO ('2027-01-01');
    CREATE TABLE market_atoms_2027q1 PARTITION OF market_atoms FOR VALUES FROM ('2027-01-01') TO ('2027-04-01');
    CREATE TABLE market_atoms_2027q2 PARTITION OF market_atoms FOR VALUES FROM ('2027-04-01') TO ('2027-07-01');
    CREATE TABLE market_atoms_2027q3 PARTITION OF market_atoms FOR VALUES FROM ('2027-07-01') TO ('2027-10-01');
    CREATE TABLE market_atoms_2027q4 PARTITION OF market_atoms FOR VALUES FROM ('2027-10-01') TO ('2028-01-01');
    CREATE TABLE market_atoms_default PARTITION OF market_atoms DEFAULT;

    INSERT INTO market_atoms SELECT * FROM market_atoms_old;
    DROP TABLE market_atoms_old;

    CREATE INDEX idx_market_atoms_created ON market_atoms (created_at);
    CREATE INDEX idx_market_atoms_type ON market_atoms (atom_type);
    CREATE INDEX idx_market_atoms_status ON market_atoms (status);
  END IF;
END $$;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 3. market_index_nav_history — monthly partitions by nav_date             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'market_index_nav_history' AND table_type = 'BASE TABLE')
     AND NOT EXISTS (SELECT 1 FROM pg_partitioned_table pt JOIN pg_class c ON pt.partrelid = c.oid WHERE c.relname = 'market_index_nav_history')
  THEN
    ALTER TABLE market_index_nav_history RENAME TO market_index_nav_history_old;

    CREATE TABLE market_index_nav_history (
      id INTEGER GENERATED ALWAYS AS IDENTITY,
      index_id TEXT NOT NULL,
      nav_date DATE NOT NULL,
      nav_value NUMERIC(16,6),
      daily_return NUMERIC(10,6),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (id, nav_date)
    ) PARTITION BY RANGE (nav_date);

    CREATE TABLE market_index_nav_2025h1 PARTITION OF market_index_nav_history FOR VALUES FROM ('2025-01-01') TO ('2025-07-01');
    CREATE TABLE market_index_nav_2025h2 PARTITION OF market_index_nav_history FOR VALUES FROM ('2025-07-01') TO ('2026-01-01');
    CREATE TABLE market_index_nav_2026h1 PARTITION OF market_index_nav_history FOR VALUES FROM ('2026-01-01') TO ('2026-07-01');
    CREATE TABLE market_index_nav_2026h2 PARTITION OF market_index_nav_history FOR VALUES FROM ('2026-07-01') TO ('2027-01-01');
    CREATE TABLE market_index_nav_2027h1 PARTITION OF market_index_nav_history FOR VALUES FROM ('2027-01-01') TO ('2027-07-01');
    CREATE TABLE market_index_nav_2027h2 PARTITION OF market_index_nav_history FOR VALUES FROM ('2027-07-01') TO ('2028-01-01');
    CREATE TABLE market_index_nav_default PARTITION OF market_index_nav_history DEFAULT;

    INSERT INTO market_index_nav_history (index_id, nav_date, nav_value, daily_return, created_at)
      SELECT index_id, nav_date, nav_value, daily_return, created_at FROM market_index_nav_history_old;
    DROP TABLE market_index_nav_history_old;

    CREATE INDEX idx_nav_history_index_date ON market_index_nav_history (index_id, nav_date);
  END IF;
END $$;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 4. market_pattern_detections — quarterly partitions by detected_at       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'market_pattern_detections' AND table_type = 'BASE TABLE')
     AND NOT EXISTS (SELECT 1 FROM pg_partitioned_table pt JOIN pg_class c ON pt.partrelid = c.oid WHERE c.relname = 'market_pattern_detections')
  THEN
    ALTER TABLE market_pattern_detections RENAME TO market_pattern_detections_old;

    CREATE TABLE market_pattern_detections (
      id TEXT NOT NULL,
      pattern_type TEXT NOT NULL,
      pattern_name TEXT,
      description TEXT,
      confidence NUMERIC(10,6),
      pattern_data JSONB DEFAULT '{}',
      affected_entities JSONB DEFAULT '[]',
      timeframe TEXT,
      status TEXT DEFAULT 'active',
      detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      PRIMARY KEY (id, detected_at)
    ) PARTITION BY RANGE (detected_at);

    CREATE TABLE market_patterns_2025h1 PARTITION OF market_pattern_detections FOR VALUES FROM ('2025-01-01') TO ('2025-07-01');
    CREATE TABLE market_patterns_2025h2 PARTITION OF market_pattern_detections FOR VALUES FROM ('2025-07-01') TO ('2026-01-01');
    CREATE TABLE market_patterns_2026h1 PARTITION OF market_pattern_detections FOR VALUES FROM ('2026-01-01') TO ('2026-07-01');
    CREATE TABLE market_patterns_2026h2 PARTITION OF market_pattern_detections FOR VALUES FROM ('2026-07-01') TO ('2027-01-01');
    CREATE TABLE market_patterns_2027h1 PARTITION OF market_pattern_detections FOR VALUES FROM ('2027-01-01') TO ('2027-07-01');
    CREATE TABLE market_patterns_2027h2 PARTITION OF market_pattern_detections FOR VALUES FROM ('2027-07-01') TO ('2028-01-01');
    CREATE TABLE market_patterns_default PARTITION OF market_pattern_detections DEFAULT;

    INSERT INTO market_pattern_detections SELECT * FROM market_pattern_detections_old;
    DROP TABLE market_pattern_detections_old;

    CREATE INDEX idx_market_patterns_detected ON market_pattern_detections (detected_at);
    CREATE INDEX idx_market_patterns_type ON market_pattern_detections (pattern_type);
  END IF;
END $$;
