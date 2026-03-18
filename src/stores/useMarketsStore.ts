import { create } from 'zustand';

export interface MarketDataSource {
  id: string;
  name: string;
  source_type: string;
  provider: string;
  config: string;
  fetch_interval_hours: number;
  is_active: number;
  last_fetch_at: string | null;
  last_fetch_status: string | null;
  last_fetch_error: string | null;
  items_fetched_total: number;
  quality_score: number;
  created_at: string;
  updated_at: string;
}

export interface MarketAtom {
  id: string;
  content: string;
  atom_type: string;
  confidence: number;
  category: string;
  subcategory: string | null;
  sentiment: string | null;
  temporal_type: string;
  entities: string;
  valid_from: string;
  valid_until: string | null;
  decay_rate: number;
  is_active: number;
  created_at: string;
}

export interface MarketWatchlistItem {
  id: string;
  symbol: string;
  name: string;
  asset_type: string;
  notes: string | null;
  alert_config: string;
  is_active: number;
  created_at: string;
}

export interface MarketComputationLog {
  id: string;
  template_name: string;
  input_params: string;
  output_data: string | null;
  status: string;
  error_message: string | null;
  execution_time_ms: number | null;
  triggered_by: string;
  created_at: string;
}

interface MarketsState {
  // Data sources
  sources: MarketDataSource[];
  sourcesLoading: boolean;
  setSources: (sources: MarketDataSource[]) => void;
  setSourcesLoading: (loading: boolean) => void;

  // Atoms
  atoms: MarketAtom[];
  atomsLoading: boolean;
  setAtoms: (atoms: MarketAtom[]) => void;
  setAtomsLoading: (loading: boolean) => void;

  // Watchlist
  watchlist: MarketWatchlistItem[];
  watchlistLoading: boolean;
  setWatchlist: (items: MarketWatchlistItem[]) => void;
  setWatchlistLoading: (loading: boolean) => void;

  // Computation
  computationLogs: MarketComputationLog[];
  setComputationLogs: (logs: MarketComputationLog[]) => void;

  // Dashboard
  dashboardStats: {
    totalSources: number;
    activeSources: number;
    totalAtoms: number;
    activeAtoms: number;
    watchlistCount: number;
    recentComputations: number;
  } | null;
  setDashboardStats: (stats: MarketsState['dashboardStats']) => void;
}

export const useMarketsStore = create<MarketsState>((set) => ({
  sources: [],
  sourcesLoading: false,
  setSources: (sources) => set({ sources }),
  setSourcesLoading: (loading) => set({ sourcesLoading: loading }),

  atoms: [],
  atomsLoading: false,
  setAtoms: (atoms) => set({ atoms }),
  setAtomsLoading: (loading) => set({ atomsLoading: loading }),

  watchlist: [],
  watchlistLoading: false,
  setWatchlist: (items) => set({ watchlist: items }),
  setWatchlistLoading: (loading) => set({ watchlistLoading: loading }),

  computationLogs: [],
  setComputationLogs: (logs) => set({ computationLogs: logs }),

  dashboardStats: null,
  setDashboardStats: (stats) => set({ dashboardStats: stats }),
}));
