import { useRef, useState } from 'react';
import {
  Camera, Loader2, AlertTriangle, ShieldCheck, ShieldAlert, X, Upload,
} from 'lucide-react';
import { fetchWithAuth, API_BASE } from '@/lib/api';

interface PhotoIdentification {
  best_match_part_number: string | null;
  confidence: 'high' | 'moderate' | 'low' | 'unknown';
  read_markings: string[];
  matched_against_hkp_id: string | null;
  counterfeit_risk: 'low' | 'moderate' | 'high' | 'critical';
  counterfeit_indicators_present: string[];
  counterfeit_indicators_absent: string[];
  recommendation: string;
  rationale: string;
  parse_error?: string;
}

const RISK_STYLES: Record<PhotoIdentification['counterfeit_risk'], string> = {
  low: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  moderate: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  critical: 'bg-red-500/10 text-red-400 border-red-500/30',
};

interface Props {
  familyId: string;
  hkpId?: string | null;
  onIdentified?: (result: PhotoIdentification) => void;
}

export default function PhotoModuleId({ familyId, hkpId, onIdentified }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [context, setContext] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PhotoIdentification | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const onPickFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const accepted = Array.from(fileList).filter(f =>
      ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(f.type)
    ).slice(0, 4);
    setFiles(accepted);
    Promise.all(accepted.map(f => new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.readAsDataURL(f);
    }))).then(setPreviews);
  };

  const removeFile = (i: number) => {
    setFiles(files.filter((_, j) => j !== i));
    setPreviews(previews.filter((_, j) => j !== i));
  };

  const submit = async () => {
    if (files.length === 0) {
      setError('Please add at least one photo of the module.');
      return;
    }
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('family_id', familyId);
      if (hkpId) formData.append('hkp_id', hkpId);
      if (context.trim()) formData.append('context', context.trim());
      files.forEach(f => formData.append('photos', f));

      const res = await fetchWithAuth(`${API_BASE}/hardware/identify-photo`, {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Identification failed');
      setResult(json.identification as PhotoIdentification);
      onIdentified?.(json.identification);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="text-sm text-adv-gray leading-snug">
        Add up to 4 photos: top of the can (vendor logo + part number), bottom of the PCB (FCC/IC IDs), side profile. Claude vision compares against the active HKP reference set.
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        capture="environment"
        onChange={(e) => onPickFiles(e.target.files)}
        className="hidden"
      />
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-2 px-3 py-2 rounded border border-adv-teal/40 bg-adv-teal/10 text-adv-teal hover:bg-adv-teal/20 text-sm"
        >
          <Camera className="w-4 h-4" />
          {files.length === 0 ? 'Add photos' : `Replace photos (${files.length})`}
        </button>
        {previews.map((src, i) => (
          <div key={i} className="relative">
            <img src={src} alt={`photo ${i + 1}`} className="w-16 h-16 object-cover rounded border border-adv-gray/30" />
            <button
              onClick={() => removeFile(i)}
              type="button"
              className="absolute -top-1 -right-1 bg-adv-dark border border-adv-gray/30 rounded-full p-0.5 hover:border-red-500/50"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      <textarea
        value={context}
        onChange={e => setContext(e.target.value)}
        placeholder="Optional context — where you bought it, sellers, anything unusual."
        rows={2}
        className="w-full bg-adv-card border border-adv-gray/30 rounded p-2 text-sm"
      />

      <button
        type="button"
        onClick={submit}
        disabled={running || files.length === 0}
        className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded bg-adv-teal text-adv-dark hover:bg-adv-teal-dark transition disabled:opacity-50 font-medium text-sm"
      >
        {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        Identify module
      </button>

      {error && (
        <div className="p-2 rounded border border-red-500/30 bg-red-500/10 text-red-400 text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5" />
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-2 p-3 rounded border border-adv-gray/20 bg-adv-card">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs text-adv-gray">Best match</div>
              <div className="font-semibold">
                {result.best_match_part_number ?? 'Unable to identify'}
              </div>
              <div className="text-xs text-adv-gray">confidence: <span className="text-adv-off-white">{result.confidence}</span></div>
            </div>
            <span className={`text-xs px-2 py-1 rounded border ${RISK_STYLES[result.counterfeit_risk]} flex items-center gap-1`}>
              {result.counterfeit_risk === 'low' ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
              {result.counterfeit_risk} risk
            </span>
          </div>

          {result.read_markings.length > 0 && (
            <div>
              <div className="text-xs text-adv-gray uppercase tracking-wide mb-1">Read markings</div>
              <ul className="text-xs font-mono text-adv-off-white space-y-0.5">
                {result.read_markings.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          )}

          {result.counterfeit_indicators_present.length > 0 && (
            <div>
              <div className="text-xs text-adv-gray uppercase tracking-wide mb-1">Counterfeit indicators present</div>
              <ul className="text-xs text-amber-400 list-disc list-inside space-y-0.5">
                {result.counterfeit_indicators_present.map((ind, i) => <li key={i}>{ind}</li>)}
              </ul>
            </div>
          )}
          {result.counterfeit_indicators_absent.length > 0 && (
            <div>
              <div className="text-xs text-adv-gray uppercase tracking-wide mb-1">Indicators absent (good)</div>
              <ul className="text-xs text-emerald-400 list-disc list-inside space-y-0.5">
                {result.counterfeit_indicators_absent.map((ind, i) => <li key={i}>{ind}</li>)}
              </ul>
            </div>
          )}

          <div>
            <div className="text-xs text-adv-gray uppercase tracking-wide mb-1">Recommendation</div>
            <p className="text-sm">{result.recommendation}</p>
          </div>
          <div>
            <div className="text-xs text-adv-gray uppercase tracking-wide mb-1">Rationale</div>
            <p className="text-xs text-adv-gray">{result.rationale}</p>
          </div>
          {result.parse_error && (
            <div className="text-xs text-amber-400 italic">parse note: {result.parse_error}</div>
          )}
        </div>
      )}
    </div>
  );
}
