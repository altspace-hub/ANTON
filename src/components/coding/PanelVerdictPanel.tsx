import { ShieldAlert, ShieldCheck, AlertTriangle, CheckCircle2, Flag, XCircle } from 'lucide-react';

// ── ANTON Studio — Core-Team PanelVerdict render (Studio P2) ───────────────
// Minimal verdict surface: a prominent BLOCKING banner when the code-computed
// gate is blocked, per-expert verdict chips + concerns, and the chair synthesis.
// The full Studio workspace (P5) replaces this; this is the honest MVP render.

export type ExpertVerdict = 'endorse' | 'flag' | 'dissent';
export type ConcernSeverity = 'low' | 'med' | 'high';

export interface PanelExpert {
  role: string;
  roleLabel: string;
  verdict: ExpertVerdict;
  concerns: { point: string; severity: ConcernSeverity }[];
  required_change: string | null;
  rationale: string | null;
  mandatory: boolean;
}

export interface PanelVerdict {
  gate: string;
  experts: PanelExpert[];
  agreements: string[];
  dissents: string[];
  open_questions: string[];
  synthesis: string | null;
  panel_verdict: ExpertVerdict;
  blocking: boolean;
}

const VERDICT_STYLE: Record<ExpertVerdict, { chip: string; icon: typeof CheckCircle2; label: string }> = {
  endorse: { chip: 'bg-adv-green/15 text-adv-green border-adv-green/30', icon: CheckCircle2, label: 'Endorse' },
  flag:    { chip: 'bg-adv-gold/15 text-adv-gold border-adv-gold/30',    icon: Flag,         label: 'Flag' },
  dissent: { chip: 'bg-adv-red/15 text-adv-red border-adv-red/30',       icon: XCircle,      label: 'Dissent' },
};

const SEVERITY_STYLE: Record<ConcernSeverity, string> = {
  low:  'bg-adv-gray-med/20 text-adv-gray',
  med:  'bg-adv-gold/15 text-adv-gold',
  high: 'bg-adv-red/15 text-adv-red',
};

export default function PanelVerdictPanel({ verdict }: { verdict: PanelVerdict }) {
  const RollupIcon = verdict.blocking
    ? ShieldAlert
    : verdict.panel_verdict === 'endorse'
      ? ShieldCheck
      : AlertTriangle;

  return (
    <div className="space-y-4">
      {/* Code-computed gate banner */}
      {verdict.blocking ? (
        <div className="flex items-start gap-3 rounded-xl border-2 border-adv-red bg-adv-red/10 px-4 py-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-adv-red" />
          <div>
            <p className="text-sm font-bold text-adv-red">GATE BLOCKED — “{verdict.gate}”</p>
            <p className="mt-0.5 text-xs text-adv-off-white">
              A mandatory core-team role dissented. This gate cannot advance until the blocking
              dissent is resolved and the panel is re-run. (Computed in code from the expert
              verdicts — not by the model.)
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-adv-card px-4 py-3">
          <RollupIcon className={`mt-0.5 h-5 w-5 shrink-0 ${verdict.panel_verdict === 'endorse' ? 'text-adv-green' : 'text-adv-gold'}`} />
          <div>
            <p className="text-sm font-semibold text-adv-off-white">
              Gate “{verdict.gate}” — panel verdict: <span className="uppercase">{verdict.panel_verdict}</span>
            </p>
            <p className="mt-0.5 text-xs text-adv-gray">
              Worst-of rollup over the seven experts. No mandatory-role dissent, so the gate is not blocked.
            </p>
          </div>
        </div>
      )}

      {/* Per-expert verdicts */}
      <div className="space-y-2">
        {verdict.experts.map((e) => {
          const style = VERDICT_STYLE[e.verdict];
          const Icon = style.icon;
          return (
            <div key={e.role} className="rounded-xl border border-border bg-adv-card p-3">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${style.chip}`}>
                  <Icon className="h-3 w-3" /> {style.label}
                </span>
                <span className="text-sm font-medium text-adv-off-white">{e.roleLabel}</span>
                {e.mandatory && (
                  <span className="rounded bg-adv-dark px-1.5 py-0.5 text-[10px] font-semibold uppercase text-adv-teal">
                    Mandatory
                  </span>
                )}
              </div>
              {e.rationale && <p className="mt-1.5 text-xs text-adv-gray">{e.rationale}</p>}
              {e.concerns.length > 0 && (
                <div className="mt-2 space-y-1">
                  {e.concerns.map((c, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className={`mt-0.5 inline-flex w-12 shrink-0 items-center justify-center rounded px-1 py-0.5 text-[10px] font-bold uppercase ${SEVERITY_STYLE[c.severity]}`}>
                        {c.severity}
                      </span>
                      <span className="text-xs text-adv-off-white">{c.point}</span>
                    </div>
                  ))}
                </div>
              )}
              {e.required_change && (
                <p className="mt-2 text-xs text-adv-off-white">
                  <span className="font-semibold text-adv-teal">Required change: </span>
                  {e.required_change}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Synthesis */}
      {verdict.synthesis && (
        <div className="rounded-xl border border-border bg-adv-card p-4">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-adv-gray">Chair synthesis</p>
          <p className="whitespace-pre-wrap text-xs text-adv-off-white">{verdict.synthesis}</p>
        </div>
      )}

      {/* Open questions */}
      {verdict.open_questions.length > 0 && (
        <div className="rounded-xl border border-border bg-adv-card p-4">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-adv-gray">Open questions</p>
          <ul className="list-disc space-y-1 pl-4">
            {verdict.open_questions.map((q, i) => (
              <li key={i} className="text-xs text-adv-off-white">{q}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
