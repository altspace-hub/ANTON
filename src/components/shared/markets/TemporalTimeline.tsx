import { AlertTriangle, CheckCircle, MinusCircle } from 'lucide-react';

interface HorizonImpact {
  assessment: 'positive' | 'negative' | 'neutral';
  reasoning: string;
}

interface TemporalLogEntry {
  id: string;
  trigger_type: string;
  impact_today: string;
  impact_this_week: string;
  impact_this_month: string;
  impact_this_year: string;
  impact_this_decade: string;
  conflicts_detected: number;
  resolution: string | null;
  created_at: string;
}

function parseImpact(raw: string | null): HorizonImpact {
  if (!raw) return { assessment: 'neutral', reasoning: '' };
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return { assessment: parsed.assessment || 'neutral', reasoning: parsed.reasoning || '' };
  } catch { return { assessment: 'neutral', reasoning: '' }; }
}

function ImpactDot({ impact }: { impact: HorizonImpact }) {
  const color = impact.assessment === 'positive' ? 'bg-adv-green' : impact.assessment === 'negative' ? 'bg-adv-red' : 'bg-adv-gray';
  return (
    <div className="flex justify-center" title={impact.reasoning}>
      <div className={`h-3 w-3 rounded-full ${color}`} />
    </div>
  );
}

export default function TemporalTimeline({ logs }: { logs: TemporalLogEntry[] }) {
  if (!logs || logs.length === 0) {
    return (
      <div className="text-center py-6 text-sm text-adv-gray">
        No temporal checks yet. Configure your Goals & Values to enable temporal reasoning.
      </div>
    );
  }

  const horizons = ['Today', 'This Week', 'This Month', 'This Year', 'This Decade'];
  const keys = ['impact_today', 'impact_this_week', 'impact_this_month', 'impact_this_year', 'impact_this_decade'] as const;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="text-left text-adv-gray font-normal pb-2 pr-4">Action</th>
            {horizons.map(h => (
              <th key={h} className="text-center text-adv-gray font-normal pb-2 px-2">{h}</th>
            ))}
            <th className="text-center text-adv-gray font-normal pb-2 px-2">Conflicts</th>
          </tr>
        </thead>
        <tbody>
          {logs.slice(0, 8).map(log => (
            <tr key={log.id} className="border-t border-adv-dark">
              <td className="py-2 pr-4 text-adv-off-white truncate max-w-[200px]" title={log.resolution ?? ''}>
                <span className="text-adv-gray">{log.trigger_type}</span>
                <span className="ml-2 text-adv-off-white">{new Date(log.created_at).toLocaleDateString()}</span>
              </td>
              {keys.map(k => (
                <td key={k} className="py-2 px-2">
                  <ImpactDot impact={parseImpact(log[k])} />
                </td>
              ))}
              <td className="py-2 px-2 text-center">
                {log.conflicts_detected > 0 ? (
                  <span className="text-adv-gold font-medium">{log.conflicts_detected}</span>
                ) : (
                  <span className="text-adv-gray">0</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
