/**
 * EngagementTeamPanel.tsx
 * Phase 1b: Team Setup
 * Define who is on this engagement — delivery team (consultants) and client contacts.
 * Claude can auto-extract from the engagement letter; manual add/edit also supported.
 */

import { useState } from 'react';
import {
  Users, Plus, Trash2, ChevronRight, Loader2, Zap,
  AlertCircle, CheckCircle, X, Building, UserCheck, Lightbulb
} from 'lucide-react';
import { getAuthHeader } from '@/lib/api';
import type { EngagementData, Stakeholder } from '@/pages/EngagementWorkspacePage';

interface Props {
  engagement: EngagementData;
  onUpdate: (updates: Partial<EngagementData>) => void;
  onNext: () => void;
  onReload: () => void;
}

type StakeholderType = 'delivery_team' | 'client_contact';

const EXPERTISE_OPTIONS = [
  'AML/CFT', 'Sanctions', 'Financial Crime', 'Compliance', 'Risk Management',
  'Regulatory Affairs', 'Legal', 'Data Analysis', 'Technology / IT', 'Business Innovation',
  'Project Management', 'Training & Change', 'Internal Audit', 'Operations',
];

interface ExtractResult {
  delivery_team?: Array<{ name: string; role: string; organisation: string; expertise_areas: string[] }>;
  client_contacts?: Array<{ name: string; role: string; organisation: string }>;
  suggested_expertise?: Array<{ area: string; reason: string }>;
}

export default function EngagementTeamPanel({ engagement, onNext, onReload }: Props) {
  const [extracting, setExtracting] = useState(false);
  const [extractResult, setExtractResult] = useState<ExtractResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<StakeholderType | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state for new member
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newOrg, setNewOrg] = useState('');
  const [newExpertise, setNewExpertise] = useState<string[]>([]);
  const [newNotes, setNewNotes] = useState('');

  const deliveryTeam = engagement.stakeholders.filter(s => s.stakeholder_type === 'delivery_team');
  const clientContacts = engagement.stakeholders.filter(s => s.stakeholder_type !== 'delivery_team');

  async function extract() {
    setExtracting(true);
    setError(null);
    setExtractResult(null);
    try {
      const res = await fetch(`/api/engagements/${engagement.id}/team/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setExtractResult(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setExtracting(false);
    }
  }

  async function importExtracted(type: StakeholderType, person: { name: string; role: string; organisation: string; expertise_areas?: string[] }) {
    await fetch(`/api/engagements/${engagement.id}/team`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({
        name: person.name, role: person.role, organisation: person.organisation,
        stakeholder_type: type, expertise_areas: person.expertise_areas || [],
      }),
    });
    onReload();
  }

  async function addMember(type: StakeholderType) {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await fetch(`/api/engagements/${engagement.id}/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          name: newName, role: newRole, organisation: newOrg || engagement.your_organisation || '',
          stakeholder_type: type, expertise_areas: newExpertise, notes: newNotes,
        }),
      });
      setNewName(''); setNewRole(''); setNewOrg(''); setNewExpertise([]); setNewNotes('');
      setAdding(null);
      onReload();
    } finally {
      setSaving(false);
    }
  }

  async function removeMember(memberId: string) {
    await fetch(`/api/engagements/${engagement.id}/team/${memberId}`, {
      method: 'DELETE',
      headers: getAuthHeader(),
    });
    onReload();
  }

  const hasLetter = engagement.documents.some(d => d.document_type === 'engagement_letter');

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-adv-teal mb-1">Phase 1b</p>
        <h2 className="text-xl font-bold text-adv-white">Team Setup</h2>
        <p className="mt-1 text-sm text-adv-gray">
          Define who is on this engagement. ANTON can extract the delivery team and client contacts from the engagement letter, or you can add them manually. Team composition is injected into every execution step.
        </p>
      </div>

      {/* Extract button */}
      <div className="flex items-center gap-3">
        <button
          onClick={extract}
          disabled={extracting || !hasLetter}
          title={!hasLetter ? 'Upload an engagement letter in Phase 1 first' : undefined}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-adv-teal text-adv-dark text-sm font-medium hover:bg-adv-teal-dark disabled:opacity-50 transition-colors"
        >
          {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          Extract team from engagement letter
        </button>
        {!hasLetter && (
          <p className="text-xs text-adv-gray">Upload the engagement letter in Setup first</p>
        )}
      </div>

      {/* Extraction results */}
      {extractResult && (
        <ExtractionResults
          result={extractResult}
          existingIds={engagement.stakeholders.map(s => s.name.toLowerCase())}
          onImport={importExtracted}
        />
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-adv-red/10 border border-adv-red/30 px-4 py-3 text-sm text-adv-red">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* ── Delivery Team ── */}
      <TeamSection
        title="Delivery Team"
        subtitle="Consultants and advisors executing this engagement"
        icon={UserCheck}
        type="delivery_team"
        members={deliveryTeam}
        onRemove={removeMember}
        adding={adding === 'delivery_team'}
        onStartAdd={() => setAdding('delivery_team')}
        onCancelAdd={() => setAdding(null)}
        defaultOrg={engagement.your_organisation || ''}
        // Add form
        newName={newName} setNewName={setNewName}
        newRole={newRole} setNewRole={setNewRole}
        newOrg={newOrg} setNewOrg={setNewOrg}
        newExpertise={newExpertise} setNewExpertise={setNewExpertise}
        newNotes={newNotes} setNewNotes={setNewNotes}
        saving={saving}
        onAdd={() => addMember('delivery_team')}
        showExpertise
      />

      {/* ── Client Contacts ── */}
      <TeamSection
        title="Client Contacts"
        subtitle="Key contacts at the client organisation"
        icon={Building}
        type="client_contact"
        members={clientContacts}
        onRemove={removeMember}
        adding={adding === 'client_contact'}
        onStartAdd={() => setAdding('client_contact')}
        onCancelAdd={() => setAdding(null)}
        defaultOrg={engagement.client_name || ''}
        newName={newName} setNewName={setNewName}
        newRole={newRole} setNewRole={setNewRole}
        newOrg={newOrg} setNewOrg={setNewOrg}
        newExpertise={newExpertise} setNewExpertise={setNewExpertise}
        newNotes={newNotes} setNewNotes={setNewNotes}
        saving={saving}
        onAdd={() => addMember('client_contact')}
        showExpertise={false}
      />

      {/* Continue */}
      <div className="flex items-center justify-between pt-2">
        <p className="text-xs text-adv-gray">
          {engagement.stakeholders.length} person{engagement.stakeholders.length !== 1 ? 's' : ''} configured
        </p>
        <button
          onClick={onNext}
          className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-adv-teal text-adv-dark text-sm font-medium hover:bg-adv-teal-dark transition-colors"
        >
          Continue to Scope
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── Extraction Results ─────────────────────────────────────────────────────────

function ExtractionResults({ result, existingIds, onImport }: {
  result: ExtractResult;
  existingIds: string[];
  onImport: (type: StakeholderType, person: { name: string; role: string; organisation: string; expertise_areas?: string[] }) => void;
}) {
  const deliveryTeam = result.delivery_team || [];
  const clientContacts = result.client_contacts || [];
  const suggestions = result.suggested_expertise || [];

  return (
    <div className="bg-adv-teal-soft border border-adv-teal/20 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-adv-teal/20">
        <CheckCircle className="h-4 w-4 text-adv-teal" />
        <h3 className="text-sm font-semibold text-adv-teal">Extracted from engagement letter</h3>
      </div>
      <div className="p-5 space-y-4">
        {deliveryTeam.length > 0 && (
          <div>
            <p className="text-xs font-medium text-adv-off-white mb-2">Delivery Team ({deliveryTeam.length})</p>
            <div className="space-y-2">
              {deliveryTeam.map((p, i) => {
                const alreadyAdded = existingIds.includes(p.name.toLowerCase());
                return (
                  <div key={i} className="flex items-center gap-3 bg-adv-dark rounded-lg px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-adv-off-white font-medium">{p.name}</p>
                      <p className="text-xs text-adv-gray">{p.role}{p.organisation ? ` · ${p.organisation}` : ''}</p>
                      {p.expertise_areas?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {p.expertise_areas.map((e, j) => (
                            <span key={j} className="text-xs bg-adv-teal-dim text-adv-teal rounded-full px-2 py-0.5">{e}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    {alreadyAdded ? (
                      <span className="text-xs text-adv-green shrink-0">Added</span>
                    ) : (
                      <button onClick={() => onImport('delivery_team', p)} className="text-xs text-adv-teal hover:text-adv-teal-dark shrink-0 font-medium">
                        + Add
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {clientContacts.length > 0 && (
          <div>
            <p className="text-xs font-medium text-adv-off-white mb-2">Client Contacts ({clientContacts.length})</p>
            <div className="space-y-2">
              {clientContacts.map((p, i) => {
                const alreadyAdded = existingIds.includes(p.name.toLowerCase());
                return (
                  <div key={i} className="flex items-center gap-3 bg-adv-dark rounded-lg px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-adv-off-white font-medium">{p.name}</p>
                      <p className="text-xs text-adv-gray">{p.role}{p.organisation ? ` · ${p.organisation}` : ''}</p>
                    </div>
                    {alreadyAdded ? (
                      <span className="text-xs text-adv-green shrink-0">Added</span>
                    ) : (
                      <button onClick={() => onImport('client_contact', p)} className="text-xs text-adv-teal hover:text-adv-teal-dark shrink-0 font-medium">
                        + Add
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {suggestions.length > 0 && (
          <div className="border-t border-adv-teal/20 pt-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Lightbulb className="h-3.5 w-3.5 text-adv-gold" />
              <p className="text-xs font-medium text-adv-gold">Suggested expertise gaps</p>
            </div>
            <div className="space-y-1.5">
              {suggestions.map((s, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="text-adv-teal shrink-0 mt-0.5">·</span>
                  <span><span className="text-adv-off-white font-medium">{s.area}</span><span className="text-adv-gray"> — {s.reason}</span></span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── TeamSection ───────────────────────────────────────────────────────────────

interface TeamSectionProps {
  title: string; subtitle: string; icon: React.ComponentType<{ className?: string }>;
  type: StakeholderType; members: Stakeholder[]; onRemove: (id: string) => void;
  adding: boolean; onStartAdd: () => void; onCancelAdd: () => void; defaultOrg: string;
  newName: string; setNewName: (v: string) => void;
  newRole: string; setNewRole: (v: string) => void;
  newOrg: string; setNewOrg: (v: string) => void;
  newExpertise: string[]; setNewExpertise: (v: string[]) => void;
  newNotes: string; setNewNotes: (v: string) => void;
  saving: boolean; onAdd: () => void; showExpertise: boolean;
}

function TeamSection({ title, subtitle, icon: Icon, members, onRemove, adding, onStartAdd, onCancelAdd, defaultOrg,
  newName, setNewName, newRole, setNewRole, newOrg, setNewOrg,
  newExpertise, setNewExpertise, newNotes, setNewNotes, saving, onAdd, showExpertise }: TeamSectionProps) {

  function toggleExpertise(area: string) {
    setNewExpertise(newExpertise.includes(area)
      ? newExpertise.filter(e => e !== area)
      : [...newExpertise, area]
    );
  }

  return (
    <div className="bg-adv-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
        <Icon className="h-4 w-4 text-adv-teal" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-adv-off-white">{title}</h3>
          <p className="text-xs text-adv-gray">{subtitle}</p>
        </div>
        <span className="text-xs text-adv-gray">{members.length} {members.length === 1 ? 'person' : 'people'}</span>
      </div>

      <div className="p-4 space-y-2">
        {members.map(m => (
          <MemberCard key={m.id} member={m} onRemove={() => onRemove(m.id)} />
        ))}

        {/* Add form */}
        {adding ? (
          <div className="bg-adv-dark-2 rounded-xl p-4 space-y-3 border border-adv-teal/30">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-adv-gray mb-1">Name *</label>
                <input
                  autoFocus
                  value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. Daniel Bardun"
                  className="w-full bg-adv-card border border-border rounded-lg px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:border-adv-teal"
                />
              </div>
              <div>
                <label className="block text-xs text-adv-gray mb-1">Role / Title</label>
                <input
                  value={newRole} onChange={e => setNewRole(e.target.value)}
                  placeholder="e.g. AML Lead Consultant"
                  className="w-full bg-adv-card border border-border rounded-lg px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:border-adv-teal"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-adv-gray mb-1">Organisation</label>
              <input
                value={newOrg || defaultOrg} onChange={e => setNewOrg(e.target.value)}
                placeholder={defaultOrg || 'Organisation name'}
                className="w-full bg-adv-card border border-border rounded-lg px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:border-adv-teal"
              />
            </div>

            {showExpertise && (
              <div>
                <label className="block text-xs text-adv-gray mb-2">Expertise areas</label>
                <div className="flex flex-wrap gap-1.5">
                  {EXPERTISE_OPTIONS.map(opt => (
                    <button
                      key={opt}
                      onClick={() => toggleExpertise(opt)}
                      className={`text-xs rounded-full px-2.5 py-1 border transition-colors ${
                        newExpertise.includes(opt)
                          ? 'bg-adv-teal text-adv-dark border-adv-teal'
                          : 'border-border text-adv-gray hover:border-adv-teal/40 hover:text-adv-teal'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs text-adv-gray mb-1">Notes (optional)</label>
              <input
                value={newNotes} onChange={e => setNewNotes(e.target.value)}
                placeholder="e.g. Available weeks 1–3 only"
                className="w-full bg-adv-card border border-border rounded-lg px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:border-adv-teal"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <button onClick={onCancelAdd} className="px-3 py-1.5 text-sm text-adv-gray hover:text-adv-off-white">Cancel</button>
              <button
                onClick={onAdd}
                disabled={!newName.trim() || saving}
                className="px-4 py-1.5 rounded-lg bg-adv-teal text-adv-dark text-sm font-medium hover:bg-adv-teal-dark disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin inline" /> : 'Add'}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={onStartAdd}
            className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-border hover:border-adv-teal/50 rounded-xl py-3 text-sm text-adv-gray hover:text-adv-teal transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add person
          </button>
        )}
      </div>
    </div>
  );
}

// ── MemberCard ────────────────────────────────────────────────────────────────

function MemberCard({ member, onRemove }: { member: Stakeholder; onRemove: () => void }) {
  let expertise: string[] = [];
  try { expertise = JSON.parse(member.expertise_areas || '[]'); } catch { /**/ }

  return (
    <div className="flex items-start gap-3 bg-adv-dark-2 rounded-lg px-3 py-2.5">
      <Users className="h-4 w-4 text-adv-teal shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-adv-off-white font-medium">{member.name}</span>
          {member.role && <span className="text-xs text-adv-gray">{member.role}</span>}
          {member.organisation && <span className="text-xs text-adv-gray">· {member.organisation}</span>}
        </div>
        {expertise.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {expertise.map((e, i) => (
              <span key={i} className="text-xs bg-adv-teal-dim text-adv-teal rounded-full px-2 py-0.5">{e}</span>
            ))}
          </div>
        )}
        {member.notes && <p className="text-xs text-adv-gray mt-1 italic">{member.notes}</p>}
      </div>
      <button onClick={onRemove} className="p-1 rounded text-adv-gray hover:text-adv-red hover:bg-adv-red/10 transition-colors shrink-0">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
