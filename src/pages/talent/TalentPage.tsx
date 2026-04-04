/**
 * TalentPage.tsx
 *
 * Dashboard for the Talent Discovery & Recruitment module.
 * Shows active hiring campaigns with phase badges, stats, and navigation.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Plus,
  ChevronRight,
  Briefcase,
  Search,
  Loader2,
  Target,
  UserCheck,
  Clock,
} from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

interface Campaign {
  id: string;
  title: string;
  department: string | null;
  hiring_manager: string | null;
  status: string;
  role_level: string | null;
  location: string | null;
  salary_range_min: number | null;
  salary_range_max: number | null;
  salary_currency: string;
  headcount: number;
  created_at: string;
  updated_at: string;
}

interface CampaignStats {
  totalCandidates: number;
  assessed: number;
  shortlisted: number;
  averageScore: number | null;
}

const PHASE_CONFIG: Record<string, { label: string; color: string }> = {
  discovery:  { label: 'Discovery',  color: 'text-adv-blue bg-adv-blue/10 border-adv-blue/30' },
  ad_live:    { label: 'Ad Live',    color: 'text-adv-gold bg-adv-gold/10 border-adv-gold/30' },
  screening:  { label: 'Screening',  color: 'text-purple-400 bg-purple-500/10 border-purple-500/30' },
  shortlist:  { label: 'Shortlist',  color: 'text-adv-teal bg-adv-teal-dim border-adv-teal/30' },
  interview:  { label: 'Interview',  color: 'text-orange-400 bg-orange-500/10 border-orange-500/30' },
  offer:      { label: 'Offer',      color: 'text-adv-green bg-adv-green/10 border-adv-green/30' },
  closed:     { label: 'Closed',     color: 'text-adv-gray bg-adv-gray/10 border-adv-gray/30' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function TalentPage() {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Array<Campaign & { stats?: CampaignStats }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [creating, setCreating] = useState(false);

  // New campaign form
  const [newTitle, setNewTitle] = useState('');
  const [newDepartment, setNewDepartment] = useState('');
  const [newRoleLevel, setNewRoleLevel] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newHeadcount, setNewHeadcount] = useState('1');

  useEffect(() => {
    loadCampaigns();
  }, []);

  async function loadCampaigns() {
    try {
      const res = await fetchWithAuth('/api/talent/campaigns');
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  async function createCampaign() {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await fetchWithAuth('/api/talent/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          department: newDepartment || undefined,
          roleLevel: newRoleLevel || undefined,
          location: newLocation || undefined,
          headcount: Number(newHeadcount) || 1,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        navigate(`/talent/campaign/${data.id}`);
      }
    } finally {
      setCreating(false);
    }
  }

  const filtered = campaigns.filter(c =>
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    (c.department ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const totalCampaigns = campaigns.length;
  const activeCampaigns = campaigns.filter(c => c.status !== 'closed').length;
  const inDiscovery = campaigns.filter(c => c.status === 'discovery').length;

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-adv-dark">
      {/* Header */}
      <div className="border-b border-border bg-adv-dark-2 px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-adv-blue/10">
              <Users className="h-5 w-5 text-adv-blue" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-adv-off-white">Talent Discovery & Recruitment</h1>
              <p className="text-sm text-adv-gray">
                Discovery-driven hiring with EU AI Act compliance
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark transition-colors hover:bg-adv-teal-dark"
          >
            <Plus className="h-4 w-4" />
            New Campaign
          </button>
        </div>
      </div>

      <div className="flex-1 px-6 py-6 space-y-6">
        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-border bg-adv-card px-4 py-3">
            <div className="text-2xl font-bold text-adv-off-white">{totalCampaigns}</div>
            <div className="text-xs text-adv-gray">Total Campaigns</div>
          </div>
          <div className="rounded-xl border border-border bg-adv-card px-4 py-3">
            <div className="text-2xl font-bold text-adv-teal">{activeCampaigns}</div>
            <div className="text-xs text-adv-gray">Active</div>
          </div>
          <div className="rounded-xl border border-border bg-adv-card px-4 py-3">
            <div className="text-2xl font-bold text-adv-blue">{inDiscovery}</div>
            <div className="text-xs text-adv-gray">In Discovery</div>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-adv-gray" />
          <input
            type="text"
            placeholder="Search campaigns..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-adv-card py-2 pl-10 pr-4 text-sm text-adv-off-white placeholder:text-adv-gray/50 focus:border-adv-teal focus:outline-none"
          />
        </div>

        {/* Campaign Cards */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-adv-teal" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Briefcase className="mb-4 h-12 w-12 text-adv-gray/40" />
            <h3 className="text-lg font-medium text-adv-off-white">
              {campaigns.length === 0 ? 'No hiring campaigns yet' : 'No matching campaigns'}
            </h3>
            <p className="mt-1 text-sm text-adv-gray">
              {campaigns.length === 0
                ? 'Start with a Team Discovery to understand what you actually need before writing a job ad.'
                : 'Try adjusting your search terms.'}
            </p>
            {campaigns.length === 0 && (
              <button
                onClick={() => setShowNewModal(true)}
                className="mt-4 flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark transition-colors hover:bg-adv-teal-dark"
              >
                <Plus className="h-4 w-4" />
                New Campaign
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(campaign => {
              const phase = PHASE_CONFIG[campaign.status] ?? PHASE_CONFIG.discovery;
              return (
                <button
                  key={campaign.id}
                  onClick={() => navigate(`/talent/campaign/${campaign.id}`)}
                  className="flex w-full items-center gap-4 rounded-xl border border-border bg-adv-card px-5 py-4 text-left transition-colors hover:border-adv-teal/40 hover:bg-adv-card/80"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="truncate text-base font-medium text-adv-off-white">
                        {campaign.title}
                      </h3>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${phase.color}`}>
                        {phase.label}
                      </span>
                      {campaign.headcount > 1 && (
                        <span className="text-xs text-adv-gray">x{campaign.headcount}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-adv-gray">
                      {campaign.department && (
                        <span className="flex items-center gap-1">
                          <Briefcase className="h-3 w-3" />
                          {campaign.department}
                        </span>
                      )}
                      {campaign.role_level && (
                        <span className="flex items-center gap-1">
                          <Target className="h-3 w-3" />
                          {campaign.role_level}
                        </span>
                      )}
                      {campaign.location && (
                        <span>{campaign.location}</span>
                      )}
                      {campaign.salary_range_min && campaign.salary_range_max && (
                        <span className="text-adv-green">
                          {campaign.salary_currency} {campaign.salary_range_min.toLocaleString()}-{campaign.salary_range_max.toLocaleString()}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {timeAgo(campaign.updated_at)}
                      </span>
                    </div>
                  </div>

                  <ChevronRight className="h-5 w-5 shrink-0 text-adv-gray" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* New Campaign Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-xl border border-border bg-adv-dark-2 p-6">
            <h2 className="mb-4 text-lg font-semibold text-adv-off-white">
              New Hiring Campaign
            </h2>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-adv-gray">
                  Role Title <span className="text-adv-red">*</span>
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="e.g., Senior Data Engineer"
                  className="w-full rounded-lg border border-border bg-adv-card px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray/50 focus:border-adv-teal focus:outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-adv-gray">Department</label>
                <input
                  type="text"
                  value={newDepartment}
                  onChange={e => setNewDepartment(e.target.value)}
                  placeholder="e.g., Engineering, Finance, Legal"
                  className="w-full rounded-lg border border-border bg-adv-card px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray/50 focus:border-adv-teal focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-adv-gray">Level</label>
                  <select
                    value={newRoleLevel}
                    onChange={e => setNewRoleLevel(e.target.value)}
                    className="w-full rounded-lg border border-border bg-adv-card px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
                  >
                    <option value="">Select...</option>
                    <option value="entry">Entry</option>
                    <option value="mid">Mid</option>
                    <option value="senior">Senior</option>
                    <option value="lead">Lead</option>
                    <option value="executive">Executive</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-adv-gray">Headcount</label>
                  <input
                    type="number"
                    min="1"
                    value={newHeadcount}
                    onChange={e => setNewHeadcount(e.target.value)}
                    className="w-full rounded-lg border border-border bg-adv-card px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-adv-gray">Location</label>
                <input
                  type="text"
                  value={newLocation}
                  onChange={e => setNewLocation(e.target.value)}
                  placeholder="e.g., Stockholm, Remote, Hybrid - London"
                  className="w-full rounded-lg border border-border bg-adv-card px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray/50 focus:border-adv-teal focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowNewModal(false);
                  setNewTitle('');
                  setNewDepartment('');
                  setNewRoleLevel('');
                  setNewLocation('');
                  setNewHeadcount('1');
                }}
                className="rounded-lg border border-border px-4 py-2 text-sm text-adv-gray transition-colors hover:text-adv-off-white"
              >
                Cancel
              </button>
              <button
                onClick={createCampaign}
                disabled={!newTitle.trim() || creating}
                className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark transition-colors hover:bg-adv-teal-dark disabled:opacity-50"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Create Campaign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
