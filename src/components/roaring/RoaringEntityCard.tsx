import React, { useState } from 'react';
import {
  Building2, Users, Shield, TrendingDown, TrendingUp, AlertTriangle,
  CheckCircle, XCircle, ChevronRight, ChevronDown, ExternalLink, Zap
} from 'lucide-react';
import type { RoaringEntityProfile, UBONode } from '../../../server/services/roaring-connector.js';

interface Props {
  profile: RoaringEntityProfile;
  onInjectToSession?: () => void;
  onOpenCounselDesk?: () => void;
  compact?: boolean;
}

function riskColor(score: number): string {
  if (score >= 70) return 'text-adv-red';
  if (score >= 30) return 'text-adv-gold';
  return 'text-adv-green';
}

function riskBg(score: number): string {
  if (score >= 70) return 'bg-red-900/20 border-adv-red/30';
  if (score >= 30) return 'bg-yellow-900/20 border-adv-gold/30';
  return 'bg-green-900/20 border-adv-green/30';
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ACTIVE: 'bg-adv-green/10 text-adv-green border-adv-green/30',
    DISSOLVED: 'bg-red-900/20 text-adv-red border-adv-red/30',
    LIQUIDATION: 'bg-yellow-900/20 text-adv-gold border-adv-gold/30',
    SUSPENDED: 'bg-orange-900/20 text-orange-400 border-orange-400/30',
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${colors[status] ?? 'bg-adv-card text-adv-gray border-adv-gray/30'}`}>
      {status}
    </span>
  );
}

function UBOTree({ node, depth = 0 }: { node: UBONode; depth?: number }) {
  const [expanded, setExpanded] = useState(depth === 0);
  const indent = depth * 20;

  return (
    <div style={{ marginLeft: indent }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-adv-card/50 transition-colors"
      >
        {node.children.length > 0 ? (
          expanded ? <ChevronDown className="h-3 w-3 text-adv-gray shrink-0" /> : <ChevronRight className="h-3 w-3 text-adv-gray shrink-0" />
        ) : <span className="w-3" />}
        <span className="text-sm text-adv-off-white">{node.name}</span>
        <span className="ml-auto text-xs font-medium text-adv-teal">{node.ownershipPct}%</span>
        {node.isPEP && (
          <span className="rounded bg-adv-gold/10 border border-adv-gold/30 px-1.5 text-[10px] text-adv-gold">PEP</span>
        )}
        <span className="text-[10px] text-adv-gray-med">{node.isDirectOwner ? 'Direct' : 'Indirect'}</span>
      </button>
      {expanded && node.children.map((child, i) => (
        <UBOTree key={i} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export function RoaringEntityCard({ profile, onInjectToSession, onOpenCounselDesk, compact = false }: Props) {
  const [section, setSection] = useState<'overview' | 'ubo' | 'board' | 'financial'>('overview');
  const isMock = profile.source === 'mock_demo_data';

  return (
    <div className={`rounded-xl border ${riskBg(profile.riskScore)} overflow-hidden`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-adv-teal/10 border border-adv-teal/20">
            <Building2 className="h-5 w-5 text-adv-teal" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-adv-off-white">{profile.company.name}</h3>
              <StatusBadge status={profile.company.status} />
            </div>
            <p className="text-xs text-adv-gray">{profile.company.orgNumber} · {profile.company.legalForm} · {profile.company.municipality}</p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-2xl font-bold ${riskColor(profile.riskScore)}`}>{profile.riskScore}</div>
          <div className="text-[10px] text-adv-gray-med">Risk Score</div>
        </div>
      </div>

      {isMock && (
        <div className="mx-4 mb-3 rounded-lg border border-adv-gold/30 bg-adv-gold/5 px-3 py-1.5 text-xs text-adv-gold">
          ⚠ Mock demo data — structurally identical to live Roaring API responses
        </div>
      )}

      {/* Risk rationale */}
      {!compact && (
        <div className="mx-4 mb-3 rounded-lg bg-adv-dark/40 px-3 py-2 text-xs text-adv-gray">
          {profile.riskRationale}
        </div>
      )}

      {/* Section tabs */}
      <div className="flex border-b border-adv-dark/50 px-4">
        {(['overview', 'ubo', 'board', 'financial'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setSection(tab)}
            className={`px-3 py-2 text-xs capitalize transition-colors ${section === tab ? 'border-b-2 border-adv-teal text-adv-teal' : 'text-adv-gray hover:text-adv-off-white'}`}
          >
            {tab === 'ubo' ? 'UBO Chain' : tab === 'financial' ? 'Financial' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className="p-4">
        {section === 'overview' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-adv-dark/40 px-3 py-2">
                <div className="text-[10px] text-adv-gray-med mb-1">Registered</div>
                <div className="text-sm text-adv-off-white">{profile.company.registrationDate}</div>
              </div>
              <div className="rounded-lg bg-adv-dark/40 px-3 py-2">
                <div className="text-[10px] text-adv-gray-med mb-1">Industry</div>
                <div className="text-xs text-adv-off-white">{profile.company.sniDescription ?? '—'}</div>
              </div>
              <div className="rounded-lg bg-adv-dark/40 px-3 py-2">
                <div className="text-[10px] text-adv-gray-med mb-1">UBO Count</div>
                <div className="text-sm text-adv-off-white">{profile.uboChain.totalUBOs} UBOs · Complexity {profile.uboChain.complexityScore}/5</div>
              </div>
              <div className="rounded-lg bg-adv-dark/40 px-3 py-2">
                <div className="text-[10px] text-adv-gray-med mb-1">Sanctions</div>
                <div className="flex items-center gap-1 text-sm">
                  {profile.sanctions.hitCount === 0
                    ? <><CheckCircle className="h-3.5 w-3.5 text-adv-green" /><span className="text-adv-green">Clear</span></>
                    : <><XCircle className="h-3.5 w-3.5 text-adv-red" /><span className="text-adv-red">{profile.sanctions.hitCount} hit(s)</span></>
                  }
                </div>
              </div>
            </div>

            {profile.uboChain.highRiskFlags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {profile.uboChain.highRiskFlags.map(flag => (
                  <span key={flag} className="flex items-center gap-1 rounded-full border border-adv-red/30 bg-red-900/10 px-2 py-0.5 text-[10px] text-adv-red">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    {flag.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {section === 'ubo' && (
          <div>
            <p className="mb-2 text-xs text-adv-gray">Ownership chain — {profile.uboChain.totalUBOs} ultimate beneficial owner(s)</p>
            {profile.uboChain.chain.map((node, i) => (
              <UBOTree key={i} node={node} />
            ))}
          </div>
        )}

        {section === 'board' && (
          <div className="space-y-2">
            {profile.boardMembers.map((member, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-adv-dark/40 px-3 py-2">
                <div>
                  <div className="text-sm text-adv-off-white">{member.name}</div>
                  <div className="text-[11px] text-adv-gray">{member.role} · from {member.appointedDate}</div>
                </div>
                <div className="flex items-center gap-1">
                  {member.pepFlag && (
                    <span className="rounded bg-adv-gold/10 border border-adv-gold/30 px-1.5 py-0.5 text-[10px] text-adv-gold">PEP</span>
                  )}
                  {member.sanctionsFlag && (
                    <span className="rounded bg-red-900/20 border border-adv-red/30 px-1.5 py-0.5 text-[10px] text-adv-red">SANCTIONS</span>
                  )}
                  {!member.pepFlag && !member.sanctionsFlag && (
                    <CheckCircle className="h-4 w-4 text-adv-green" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {section === 'financial' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-adv-dark/40 px-3 py-2">
                <div className="text-[10px] text-adv-gray-med mb-1">Revenue Band</div>
                <div className="text-sm text-adv-off-white">{profile.financialRisk.revenueband}</div>
              </div>
              <div className="rounded-lg bg-adv-dark/40 px-3 py-2">
                <div className="text-[10px] text-adv-gray-med mb-1">Credit Rating</div>
                <div className={`text-sm font-bold ${
                  profile.financialRisk.creditRating === 'A' ? 'text-adv-green' :
                  profile.financialRisk.creditRating === 'B' ? 'text-adv-teal' :
                  profile.financialRisk.creditRating === 'C' ? 'text-adv-gold' : 'text-adv-red'
                }`}>{profile.financialRisk.creditRating}</div>
              </div>
              <div className="rounded-lg bg-adv-dark/40 px-3 py-2">
                <div className="text-[10px] text-adv-gray-med mb-1">Revenue Change (2y)</div>
                <div className={`flex items-center gap-1 text-sm ${profile.financialRisk.revenueChange2y < 0 ? 'text-adv-red' : 'text-adv-green'}`}>
                  {profile.financialRisk.revenueChange2y < 0
                    ? <TrendingDown className="h-3.5 w-3.5" />
                    : <TrendingUp className="h-3.5 w-3.5" />
                  }
                  {profile.financialRisk.revenueChange2y > 0 ? '+' : ''}{profile.financialRisk.revenueChange2y}%
                </div>
              </div>
              <div className="rounded-lg bg-adv-dark/40 px-3 py-2">
                <div className="text-[10px] text-adv-gray-med mb-1">Payment Remarks</div>
                <div className={`text-sm ${profile.financialRisk.paymentRemarks > 0 ? 'text-adv-red' : 'text-adv-green'}`}>
                  {profile.financialRisk.paymentRemarks}
                </div>
              </div>
            </div>
            {profile.financialRisk.employeeCount !== undefined && (
              <div className="flex items-center gap-2 text-xs text-adv-gray">
                <Users className="h-3.5 w-3.5" />
                {profile.financialRisk.employeeCount} employees · Last report: {profile.financialRisk.lastReportDate}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      {(onInjectToSession || onOpenCounselDesk) && (
        <div className="flex gap-2 border-t border-adv-dark/50 p-3">
          {onInjectToSession && (
            <button
              onClick={onInjectToSession}
              className="flex items-center gap-1.5 rounded-lg bg-adv-teal/10 border border-adv-teal/30 px-3 py-1.5 text-xs text-adv-teal hover:bg-adv-teal/20 transition-colors"
            >
              <Zap className="h-3.5 w-3.5" />
              Inject into session
            </button>
          )}
          {onOpenCounselDesk && (
            <button
              onClick={onOpenCounselDesk}
              className="flex items-center gap-1.5 rounded-lg bg-adv-card border border-adv-gray/20 px-3 py-1.5 text-xs text-adv-off-white hover:bg-adv-dark/60 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open EDD in Counsel's Desk
            </button>
          )}
        </div>
      )}
    </div>
  );
}
