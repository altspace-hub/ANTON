import React, { useState } from 'react';
import {
  Shield, AlertTriangle, CheckCircle, ChevronDown, ChevronRight,
  Newspaper, Eye, Bell, Download, User, Globe
} from 'lucide-react';
import type { DJScreenResult, DJHit, AdverseMediaResult, PEPProfile } from '../../../server/services/dowjones-connector.js';

interface Props {
  result: DJScreenResult;
  adverseMedia?: AdverseMediaResult;
  pepProfile?: PEPProfile;
  onAddToMonitoring?: () => void;
  onExportAudit?: () => void;
  onOpenCounselDesk?: () => void;
}

const RISK_CONFIG = {
  HIGH:   { color: 'text-adv-red',   bg: 'bg-red-900/20 border-adv-red/30',   label: 'HIGH RISK' },
  MEDIUM: { color: 'text-adv-gold',  bg: 'bg-yellow-900/20 border-adv-gold/30', label: 'MEDIUM' },
  LOW:    { color: 'text-adv-green', bg: 'bg-green-900/20 border-adv-green/30', label: 'LOW RISK' },
  CLEAR:  { color: 'text-adv-teal',  bg: 'bg-adv-teal/10 border-adv-teal/20',  label: 'CLEAR' },
};

const LIST_TYPE_ICONS = {
  SANCTIONS: <Shield className="h-4 w-4 text-adv-red" />,
  PEP: <User className="h-4 w-4 text-adv-gold" />,
  ADVERSE_MEDIA: <Newspaper className="h-4 w-4 text-adv-blue" />,
  SOE: <Globe className="h-4 w-4 text-adv-gray" />,
  ENFORCEMENT: <AlertTriangle className="h-4 w-4 text-orange-400" />,
};

const MATCH_COLOR = {
  EXACT: 'text-adv-red bg-red-900/20 border-adv-red/30',
  STRONG: 'text-adv-gold bg-yellow-900/20 border-adv-gold/30',
  PARTIAL: 'text-adv-gray bg-adv-card border-adv-gray/30',
};

function HitCard({ hit }: { hit: DJHit }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-lg border border-adv-dark/50 bg-adv-dark/30 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 p-3 text-left hover:bg-adv-dark/50 transition-colors"
      >
        {LIST_TYPE_ICONS[hit.listType] ?? <Shield className="h-4 w-4 text-adv-gray" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-adv-off-white truncate">{hit.entityName}</span>
            <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${MATCH_COLOR[hit.matchStrength]}`}>
              {hit.matchStrength}
            </span>
          </div>
          <div className="text-xs text-adv-gray mt-0.5">
            {hit.listType} · {hit.sourceLists.join(', ')}
          </div>
        </div>
        {expanded ? <ChevronDown className="h-4 w-4 text-adv-gray shrink-0" /> : <ChevronRight className="h-4 w-4 text-adv-gray shrink-0" />}
      </button>
      {expanded && (
        <div className="border-t border-adv-dark/50 px-3 pb-3 pt-2 space-y-2">
          {hit.details && (
            <p className="text-xs text-adv-gray">{hit.details}</p>
          )}
          <div className="flex flex-wrap gap-1">
            <span className="text-[10px] text-adv-gray-med">Added: {hit.dateAdded}</span>
            {hit.associatedEntities && hit.associatedEntities.length > 0 && (
              <>
                <span className="text-[10px] text-adv-gray-med">·</span>
                <span className="text-[10px] text-adv-gray-med">Associated: {hit.associatedEntities.join(', ')}</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionAccordion({ title, icon, count, children, defaultOpen = false }: {
  title: string; icon: React.ReactNode; count?: number; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-adv-dark/40 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-adv-dark/30 transition-colors"
      >
        {icon}
        <span className="flex-1 text-sm font-medium text-adv-off-white">{title}</span>
        {count !== undefined && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${count > 0 ? 'bg-red-900/30 text-adv-red' : 'bg-adv-teal/10 text-adv-teal'}`}>
            {count > 0 ? `${count} hit(s)` : 'Clear'}
          </span>
        )}
        {open ? <ChevronDown className="h-4 w-4 text-adv-gray" /> : <ChevronRight className="h-4 w-4 text-adv-gray" />}
      </button>
      {open && <div className="border-t border-adv-dark/40 p-3 space-y-2">{children}</div>}
    </div>
  );
}

export function DJScreeningPanel({ result, adverseMedia, pepProfile, onAddToMonitoring, onExportAudit, onOpenCounselDesk }: Props) {
  const riskCfg = RISK_CONFIG[result.riskScore];
  const isMock = result.source === 'mock_demo_data';

  const sanctionHits = result.hits.filter(h => h.listType === 'SANCTIONS');
  const pepHits = result.hits.filter(h => h.listType === 'PEP');
  const mediaHits = result.hits.filter(h => h.listType === 'ADVERSE_MEDIA');
  const soeHits = result.hits.filter(h => h.listType === 'SOE');
  const enfHits = result.hits.filter(h => h.listType === 'ENFORCEMENT');

  return (
    <div className="space-y-4">
      {/* Header banner */}
      <div className={`rounded-xl border p-4 ${riskCfg.bg}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {result.riskScore === 'CLEAR'
              ? <CheckCircle className="h-7 w-7 text-adv-teal" />
              : <AlertTriangle className={`h-7 w-7 ${riskCfg.color}`} />
            }
            <div>
              <div className={`text-lg font-bold ${riskCfg.color}`}>{riskCfg.label}</div>
              <div className="text-xs text-adv-gray">{result.entityQueried}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-adv-gray-med">Ref: {result.referenceId}</div>
            <div className="text-xs text-adv-gray-med">{new Date(result.screenedAt).toLocaleString()}</div>
            <div className="mt-1 text-xs font-medium text-adv-off-white">
              {result.hits.length === 0 ? 'No hits' : `${result.hits.length} hit(s) found`}
            </div>
          </div>
        </div>
      </div>

      {isMock && (
        <div className="rounded-lg border border-adv-gold/30 bg-adv-gold/5 px-3 py-2 text-xs text-adv-gold">
          ⚠ Mock demo data — structurally identical to live Dow Jones R&C API responses
        </div>
      )}

      {/* Screening sections */}
      <div className="space-y-2">
        <SectionAccordion
          title="Sanctions"
          icon={<Shield className="h-4 w-4 text-adv-red" />}
          count={sanctionHits.length}
          defaultOpen={sanctionHits.length > 0}
        >
          {sanctionHits.length === 0
            ? <p className="text-xs text-adv-gray">No hits on any sanctions list (OFAC, EU, UN, OFSI, SECO + 46 others).</p>
            : sanctionHits.map((hit, i) => <HitCard key={i} hit={hit} />)
          }
        </SectionAccordion>

        <SectionAccordion
          title="Politically Exposed Persons (PEP)"
          icon={<User className="h-4 w-4 text-adv-gold" />}
          count={pepHits.length}
          defaultOpen={pepHits.length > 0}
        >
          {pepHits.length === 0
            ? <p className="text-xs text-adv-gray">No PEP matches found in the global PEP database (1.4M+ entries).</p>
            : pepHits.map((hit, i) => <HitCard key={i} hit={hit} />)
          }
          {pepProfile && (
            <div className="mt-3 rounded-lg bg-adv-dark/30 border border-adv-dark/50 p-3">
              <div className="text-xs font-medium text-adv-off-white mb-2">PEP Profile — Tier {pepProfile.tier}</div>
              {pepProfile.positions.map((pos, i) => (
                <div key={i} className="text-xs text-adv-gray">
                  {pos.title}, {pos.country} ({pos.from}{pos.to ? ` – ${pos.to}` : ' – present'})
                </div>
              ))}
            </div>
          )}
        </SectionAccordion>

        <SectionAccordion
          title="Adverse Media"
          icon={<Newspaper className="h-4 w-4 text-adv-blue" />}
          count={adverseMedia?.totalArticles ?? mediaHits.length}
          defaultOpen={adverseMedia ? adverseMedia.totalArticles > 0 : mediaHits.length > 0}
        >
          {adverseMedia && adverseMedia.articles.length > 0 ? (
            <div className="space-y-2">
              {adverseMedia.articles.map((article, i) => (
                <div key={i} className="rounded-lg bg-adv-dark/30 border border-adv-dark/50 p-3">
                  <div className="text-xs font-medium text-adv-off-white mb-1">{article.headline}</div>
                  <div className="text-[11px] text-adv-gray mb-1">{article.source} · {article.publishedAt}</div>
                  <p className="text-xs text-adv-gray">{article.summary}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {article.riskCategories.map(cat => (
                      <span key={cat} className="rounded-full bg-adv-blue/10 border border-adv-blue/20 px-1.5 py-0.5 text-[10px] text-adv-blue">{cat}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : mediaHits.length === 0 ? (
            <p className="text-xs text-adv-gray">No adverse media found in 35,000+ global sources.</p>
          ) : (
            mediaHits.map((hit, i) => <HitCard key={i} hit={hit} />)
          )}
        </SectionAccordion>

        <SectionAccordion
          title="State-Owned Entities (SOE)"
          icon={<Globe className="h-4 w-4 text-adv-gray" />}
          count={soeHits.length}
        >
          {soeHits.length === 0
            ? <p className="text-xs text-adv-gray">No government linkage found (100,000+ SOE database).</p>
            : soeHits.map((hit, i) => <HitCard key={i} hit={hit} />)
          }
        </SectionAccordion>

        {enfHits.length > 0 && (
          <SectionAccordion
            title="Enforcement Actions"
            icon={<AlertTriangle className="h-4 w-4 text-orange-400" />}
            count={enfHits.length}
            defaultOpen
          >
            {enfHits.map((hit, i) => <HitCard key={i} hit={hit} />)}
          </SectionAccordion>
        )}
      </div>

      {/* AMLR regulatory context */}
      <div className="rounded-lg border border-adv-teal/20 bg-adv-teal/5 px-3 py-2">
        <div className="text-[10px] font-medium text-adv-teal mb-1">AMLR Regulatory Context</div>
        <div className="text-xs text-adv-gray">
          {result.hits.some(h => h.listType === 'PEP')
            ? 'PEP match triggers Art. 22 (enhanced due diligence for PEPs) and Art. 21 (senior management approval). Ongoing monitoring required per Art. 40.'
            : result.hits.some(h => h.listType === 'SANCTIONS')
            ? 'Sanctions match — Art. 16 (real-time screening), Art. 40 (freezing obligations). DO NOT PROCEED without compliance officer review.'
            : 'No hits found. Standard CDD sufficient. Maintain Art. 16 ongoing monitoring for high-risk clients.'
          }
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {onAddToMonitoring && (
          <button
            onClick={onAddToMonitoring}
            className="flex items-center gap-1.5 rounded-lg bg-adv-teal/10 border border-adv-teal/30 px-3 py-1.5 text-xs text-adv-teal hover:bg-adv-teal/20 transition-colors"
          >
            <Bell className="h-3.5 w-3.5" />
            Add to monitoring
          </button>
        )}
        {onOpenCounselDesk && (
          <button
            onClick={onOpenCounselDesk}
            className="flex items-center gap-1.5 rounded-lg bg-adv-card border border-adv-gray/20 px-3 py-1.5 text-xs text-adv-off-white hover:bg-adv-dark/60 transition-colors"
          >
            <Eye className="h-3.5 w-3.5" />
            Open Counsel's Desk
          </button>
        )}
        {onExportAudit && (
          <button
            onClick={onExportAudit}
            className="flex items-center gap-1.5 rounded-lg bg-adv-card border border-adv-gray/20 px-3 py-1.5 text-xs text-adv-off-white hover:bg-adv-dark/60 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Export audit record
          </button>
        )}
      </div>
    </div>
  );
}
