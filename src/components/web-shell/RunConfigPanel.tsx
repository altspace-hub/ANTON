/**
 * RunConfigPanel — Web UX v2 collapsible run configuration.
 *
 * Layout per design/web-v3-screens.jsx WSanctionsFullRun, EXTENDED to
 * preserve every setting from the current ModulePage left column
 * (see docs/WEB_REDESIGN_INVENTORY.md):
 *
 *   • Collapsible header bar with summary line + Show/Hide toggle
 *   • Row 1 (4-col): Depth · Model · Precision · Writing Style
 *   • Row 2 (3-col): Multi-Agent · Deliberation · Session Toggles
 *     (Session Toggles = Output Controls + Reasoning + Knowledge Memory)
 *   • Row 3 (2-col, NEW): Knowledge Sources · Output Formats — the two
 *     critical sections the design originally omitted
 *   • Row 4 (2-col): Skills · Knowledge Atoms Used
 *   • Row 5 (2-col): Module Settings (DynamicModule slot) · Situation/Context
 *   • Row 6 (2-col): Upload Documents · Advanced Settings (collapses
 *     Communications, Structure ref, Reference output, domain banners)
 *
 * SLOT-BASED. Every cell is a React node passed by the parent — typically
 * one of the existing components in `src/components/shared/*`. This means
 * the panel inherits ALL existing logic and edge cases without rewrite.
 */

import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Settings as SettingsIcon } from 'lucide-react';
import { SettingBlock } from './SettingBlock';

export interface RunConfigPanelProps {
  /** Initial open state. Defaults to true so users see config on first visit. */
  defaultOpen?: boolean;
  /** Compact summary shown in the collapsed bar (e.g. "Think Hard · Haiku 4.5 · Balanced"). */
  summaryLine?: string;

  /** Row 1 — base AI controls */
  depth?: ReactNode;
  model?: ReactNode;
  precision?: ReactNode;
  writingStyle?: ReactNode;          // also handles Persona internally

  /** Row 2 — agent / multi-model / session-wide toggles */
  multiAgent?: ReactNode;
  deliberation?: ReactNode;
  sessionToggles?: ReactNode;         // Output Controls + Reasoning + Knowledge Memory

  /** Row 3 — the critical NEW additions (don't omit) */
  knowledgeSources?: ReactNode;       // 7-mode picker
  outputFormats?: ReactNode;          // 40+ formats × 6 categories

  /** Row 4 */
  skills?: ReactNode;
  knowledgeAtoms?: ReactNode;

  /** Row 5 — module-specific + per-run input */
  moduleSettings?: ReactNode;          // DynamicModule slot — varies per module
  situation?: ReactNode;               // free-text situation/context

  /** Row 6 */
  upload?: ReactNode;
  /** Advanced collapsible content. Communications, Structure ref, Reference output, domain banners. */
  advanced?: ReactNode;
  /** Hide the Advanced collapsible row entirely (e.g. when there's nothing to put inside). */
  hideAdvanced?: boolean;

  /** Optional precision-row hint (e.g. "Controls temperature across providers"). */
  precisionHint?: ReactNode;
}

export function RunConfigPanel({
  defaultOpen = true,
  summaryLine,
  depth, model, precision, writingStyle,
  multiAgent, deliberation, sessionToggles,
  knowledgeSources, outputFormats,
  skills, knowledgeAtoms,
  moduleSettings, situation,
  upload, advanced, hideAdvanced,
  precisionHint,
}: RunConfigPanelProps): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <div className="w-full">
      {/* Collapsible header bar — stays sticky-ish when scrolling */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2.5 px-7 py-2"
        style={{
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border-soft)',
        }}
      >
        <SettingsIcon size={13} strokeWidth={1.5} className="text-[var(--color-text-muted)]" />
        <span className="text-[12.5px] font-semibold text-[var(--color-text)]">Run configuration</span>
        {summaryLine && (
          <span className="truncate text-[11px] text-[var(--color-text-muted)]">{summaryLine}</span>
        )}
        <span className="flex-1" />
        <span className="font-mono text-[11px] text-[var(--color-text-muted)]">
          {open ? 'Hide' : 'Show'}
        </span>
        {open
          ? <ChevronDown  size={14} strokeWidth={1.5} className="text-[var(--color-text-muted)]" />
          : <ChevronRight size={14} strokeWidth={1.5} className="text-[var(--color-text-muted)]" />}
      </button>

      {open && (
        <div
          className="px-7 py-4"
          style={{
            background: 'var(--color-surface)',
            borderBottom: '1px solid var(--color-border-soft)',
          }}
        >
          {/* ── Row 1 — base AI controls (4-col) ─────────────── */}
          {(depth || model || precision || writingStyle) && (
            <div className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-4">
              {depth        && <SettingBlock label="How deeply should Claude analyse?">{depth}</SettingBlock>}
              {model        && <SettingBlock label="Model">{model}</SettingBlock>}
              {precision    && <SettingBlock label="Precision" right={precisionHint}>{precision}</SettingBlock>}
              {writingStyle && <SettingBlock label="Writing style">{writingStyle}</SettingBlock>}
            </div>
          )}

          {/* ── Row 2 — toggles + session controls (3-col) ──── */}
          {(multiAgent || deliberation || sessionToggles) && (
            <div className="mt-4 grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-3">
              {multiAgent     && <div>{multiAgent}</div>}
              {deliberation   && <div>{deliberation}</div>}
              {sessionToggles && <div>{sessionToggles}</div>}
            </div>
          )}

          {/* ── Row 3 — Knowledge Sources + Output Formats (NEW, 2-col) ── */}
          {(knowledgeSources || outputFormats) && (
            <div className="mt-4 grid grid-cols-1 gap-x-5 gap-y-4 lg:grid-cols-2">
              {knowledgeSources && (
                <SettingBlock label="Knowledge Sources" right="Where Claude pulls reference material from">
                  {knowledgeSources}
                </SettingBlock>
              )}
              {outputFormats && (
                <SettingBlock label="What should Claude produce?" right="Pick one or more output formats">
                  {outputFormats}
                </SettingBlock>
              )}
            </div>
          )}

          {/* ── Row 4 — Skills + Knowledge Atoms ─────────────── */}
          {(skills || knowledgeAtoms) && (
            <div className="mt-4 grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2">
              {skills         && <div>{skills}</div>}
              {knowledgeAtoms && <div>{knowledgeAtoms}</div>}
            </div>
          )}

          {/* ── Row 5 — Module Settings (DynamicModule slot) + Situation ─── */}
          {(moduleSettings || situation) && (
            <div className="mt-4 grid grid-cols-1 gap-x-5 gap-y-4 lg:grid-cols-2">
              {moduleSettings && <SettingBlock label="Module Settings">{moduleSettings}</SettingBlock>}
              {situation      && <SettingBlock label="Situation / Context">{situation}</SettingBlock>}
            </div>
          )}

          {/* ── Row 6 — Upload + Advanced ─────────────────────── */}
          {(upload || (advanced && !hideAdvanced)) && (
            <div className="mt-4 grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2">
              {upload && <SettingBlock label="Uploaded Documents">{upload}</SettingBlock>}
              {advanced && !hideAdvanced && (
                <div>
                  <button
                    type="button"
                    onClick={() => setAdvancedOpen(a => !a)}
                    className="inline-flex items-center gap-1.5 text-[10.5px] font-mono text-[var(--color-text-faint)]"
                  >
                    Advanced Settings
                    {advancedOpen
                      ? <ChevronDown  size={10} strokeWidth={1.5} />
                      : <ChevronRight size={10} strokeWidth={1.5} />}
                  </button>
                  {advancedOpen && (
                    <div
                      className="mt-2 p-3"
                      style={{
                        background: 'var(--color-surface-alt)',
                        border: '1px solid var(--color-border-soft)',
                        borderRadius: 'var(--radius-r2)',
                      }}
                    >
                      {advanced}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
