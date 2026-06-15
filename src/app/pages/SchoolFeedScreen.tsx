/**
 * SchoolFeedScreen — companion-app School tab (Evolution design).
 *
 * Per design/screens-modules.jsx SchoolFeedScreen:
 *   • Top bar — name + day/course sub + streak badge with 🔥
 *   • Today's goal hero — accent-coloured card with progress dots,
 *     offline/audio chips, "Continue lesson →" primary button
 *   • Up next list — Watch / Practice / Homework / Ask cards
 *   • Homework camera footer — "Snap a photo, ANTON shows the steps"
 *
 * v1: today_lesson is currently null (curriculum tables not yet here)
 * — UI gracefully shows an empty state and keeps the homework camera
 * CTA prominent. Streak is real (sessions/day in last 30 days).
 */

import { useEffect, useState } from 'react';
import { Pill, SectionLabel, Ico, Spinner } from '../components/ui';
import { getSchoolFeed, type SchoolFeed, type UpNextItem } from '../services/school';

interface Props {
  orgId: string;
  onNavigate: (tab: string) => void;
}

const ICON_FOR: Record<UpNextItem['icon'] | string, 'mic' | 'camera' | 'sparkles' | 'inbox' | 'check'> = {
  mic:      'mic',
  camera:   'camera',
  sparkles: 'sparkles',
  inbox:    'inbox',
  check:    'check',
};

const COLOR_VAR: Record<UpNextItem['color'], string> = {
  red:   'var(--color-red)',
  blue:  'var(--color-blue)',
  gold:  'var(--color-gold)',
  teal:  'var(--color-accent)',
  green: 'var(--color-green)',
};

export default function SchoolFeedScreen({ orgId, onNavigate }: Props): JSX.Element {
  const [feed,    setFeed]    = useState<SchoolFeed | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const f = await getSchoolFeed(orgId);
        if (!cancelled) setFeed(f);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orgId]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ background: 'var(--color-bg)' }}>
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ background: 'var(--color-surface-alt)', minHeight: 44 }}
      >
        <div>
          <h1
            className="text-[var(--color-text)]"
            style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.4px', lineHeight: 1.05 }}
          >
            School
          </h1>
          <div className="font-mono text-[0.6875rem] text-[var(--color-text-muted)]">
            {feed ? `${feed.day_label} · ${feed.course_label}` : 'Loading…'}
          </div>
        </div>
        {feed && feed.streak > 0 && (
          <div
            className="flex items-center gap-1 rounded-full px-2 py-1"
            style={{ background: 'var(--color-gold-dim)' }}
          >
            <span style={{ color: 'var(--color-gold)' }} aria-hidden="true">
              <Ico name="flame" color="var(--color-gold)" size={13} />
            </span>
            <span
              className="font-bold"
              style={{ color: 'var(--color-gold)', fontSize: '0.75rem' }}
            >
              {feed.streak}
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-5 pt-2">
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : (
          <>
            {/* Today's goal hero — present when curriculum data exists */}
            {feed?.today_lesson ? (
              <div
                className="mb-4 rounded-[var(--radius-r3)] p-4 text-white"
                style={{ background: 'var(--color-accent)' }}
              >
                <div
                  className="mb-1 font-mono font-bold uppercase opacity-85"
                  style={{ fontSize: '0.6875rem', letterSpacing: '0.5px' }}
                >
                  TODAY · {feed.today_lesson.duration_minutes} MIN
                </div>
                <div
                  style={{ fontSize: '1.0625rem', fontWeight: 600, letterSpacing: '-0.3px', lineHeight: 1.25, marginBottom: 10 }}
                >
                  {feed.today_lesson.title}
                </div>
                {/* Progress dots */}
                <div className="mb-2.5 flex gap-1">
                  {Array.from({ length: feed.today_lesson.progress_steps }).map((_, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-sm"
                      style={{
                        height: 5,
                        background: i < feed.today_lesson!.completed_steps ? '#fff' : 'rgba(255,255,255,0.3)',
                      }}
                    />
                  ))}
                </div>
                {/* Capability chips */}
                <div className="mb-2.5 flex gap-1.5">
                  {feed.today_lesson.offline_ready && (
                    <Pill
                      tone="neutral"
                      style={{
                        background: 'color-mix(in srgb, #fff 18%, transparent)',
                        color: '#fff',
                        borderColor: 'color-mix(in srgb, #fff 30%, transparent)',
                      }}
                    >
                      <span className="mr-1 inline-flex align-middle">
                        <Ico name="wifiOff" size={11} color="currentColor" />
                      </span>
                      Offline-ready
                    </Pill>
                  )}
                  {feed.today_lesson.audio_available && (
                    <Pill
                      tone="neutral"
                      style={{
                        background: 'color-mix(in srgb, #fff 18%, transparent)',
                        color: '#fff',
                        borderColor: 'color-mix(in srgb, #fff 30%, transparent)',
                      }}
                    >
                      <span className="mr-1 inline-flex align-middle">
                        <Ico name="headphones" size={11} color="currentColor" />
                      </span>
                      Audio
                    </Pill>
                  )}
                </div>
                <button
                  onClick={() => onNavigate('chat')}
                  className="w-full rounded-[var(--radius-r2)] py-3 font-bold"
                  style={{
                    background: '#fff',
                    color: 'var(--color-accent)',
                    fontSize: '0.875rem',
                    letterSpacing: '-0.1px',
                  }}
                >
                  Continue lesson →
                </button>
              </div>
            ) : (
              /* Empty state when no lesson is configured yet */
              <div
                className="mb-4 rounded-[var(--radius-r3)] p-4"
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <div
                  className="mb-1.5 font-mono font-bold uppercase"
                  style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', letterSpacing: '0.5px' }}
                >
                  Get started
                </div>
                <div
                  className="text-[var(--color-text)]"
                  style={{ fontSize: '1rem', fontWeight: 600, lineHeight: 1.25, letterSpacing: '-0.2px' }}
                >
                  Set up your School profile on the main ANTON to start a learning streak.
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-text-muted)]">
                  Once your course is configured, the day's lesson will appear here with a one-tap "continue" button.
                </p>
              </div>
            )}

            {/* Up next */}
            {feed && feed.up_next.length > 0 && (
              <>
                <SectionLabel className="mb-2">Up next</SectionLabel>
                {feed.up_next.map(item => {
                  const iconName = ICON_FOR[item.icon] || 'sparkles';
                  return (
                    <button
                      key={item.id}
                      // FM9: both branches of the ternary navigated to the same
                      // place — collapsed. When per-kind routing lands (e.g.
                      // 'ask' → composer prefilled with item title), branch here.
                      onClick={() => onNavigate('chat')}
                      className="mb-2 flex w-full items-center gap-3 rounded-[var(--radius-r2)] p-3 text-left"
                      style={{
                        background: 'var(--color-surface)',
                        border: `1px solid ${item.due ? 'var(--color-gold)' : 'var(--color-border)'}`,
                      }}
                    >
                      <div
                        className="flex flex-shrink-0 items-center justify-center rounded-[12px]"
                        style={{ width: 40, height: 40, background: COLOR_VAR[item.color] }}
                      >
                        <Ico name={iconName} color="#fff" size={18} />
                      </div>
                      <div className="flex-1">
                        <div
                          className="text-[var(--color-text)]"
                          style={{ fontSize: '0.875rem', fontWeight: 600, letterSpacing: '-0.1px' }}
                        >
                          {item.title}
                        </div>
                        <div
                          style={{
                            fontSize: '0.6875rem',
                            color: item.due ? 'var(--color-gold)' : 'var(--color-text-muted)',
                            fontWeight: item.due ? 600 : 400,
                          }}
                        >
                          {item.subtitle}
                        </div>
                      </div>
                      {item.kind === 'ask' && <Pill tone="teal">AI</Pill>}
                      <Ico name="chevronRight" color="var(--color-text-faint)" size={16} />
                    </button>
                  );
                })}
              </>
            )}

            {/* Homework camera footer */}
            <div
              className="mt-3 flex items-center gap-2.5 rounded-[var(--radius-r2)] p-3"
              style={{
                background: 'var(--color-surface-alt)',
                border: '1px dashed var(--color-border)',
              }}
            >
              <Ico name="camera" color="var(--color-accent)" size={20} />
              <button
                onClick={() => onNavigate('capture')}
                className="flex-1 text-left text-xs leading-relaxed text-[var(--color-text-body)]"
              >
                <b>Stuck on homework?</b> Snap a photo — ANTON shows you the steps, doesn't just give the answer.
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
