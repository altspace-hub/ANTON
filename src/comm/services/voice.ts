/**
 * voice.ts — voice-note capture for the Comm App.
 *
 * Pipeline:
 *   1. getUserMedia({ audio }) — browser/Capacitor prompts for RECORD_AUDIO.
 *   2. MediaRecorder captures the stream into a Blob (opus/webm preferred,
 *      audio/mp4 fallback for iOS Safari).
 *   3. In parallel, a WebAudio AnalyserNode samples the input RMS into a
 *      fixed-length waveform array (≤ WAVEFORM_BUCKETS values, 0-1).
 *   4. On stop, base64-encode the blob and return everything together.
 *
 * Audio is throttled to ~32 kbps to keep <60 s recordings under the
 * relay's 1 MiB inline cap.
 */
import { isWithinRelayCap, type Capture } from './capture';

export const MAX_RECORDING_SEC = 60;
export const TARGET_BITRATE_BPS = 32_000;
export const WAVEFORM_BUCKETS = 64;

export interface VoiceRecording {
  /** Base64 (no data-URL prefix) */
  audio: string;
  mimeType: string;
  durationSec: number;
  /** Per-bucket RMS amplitude in [0, 1]. Length ≤ WAVEFORM_BUCKETS. */
  waveform: number[];
  /** Bytes (decoded) — useful for the 1MiB cap check */
  size: number;
}

export class VoiceRecordingError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'VoiceRecordingError';
  }
}

/** Pick a MediaRecorder MIME type the platform actually supports. */
function pickMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const m of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return ''; // let the browser default
}

/**
 * Live recording handle. Created via `startRecording`. The caller calls
 * `stop()` to finalise or `cancel()` to discard everything.
 */
export interface RecordingHandle {
  /** Seconds since `startRecording` resolved. Polling this in the UI loop
   *  drives the timer display. */
  elapsedSec(): number;
  /** Latest waveform progress so the UI can paint a live "growing" bar. */
  currentWaveform(): number[];
  /** Stop, flush, and return the recording. Throws if no audio captured. */
  stop(): Promise<VoiceRecording>;
  /** Discard everything (no recording produced). Safe to call multiple times. */
  cancel(): void;
}

export async function startRecording(): Promise<RecordingHandle> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new VoiceRecordingError('Microphone API not available', 'NO_API');
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
  } catch (err) {
    const code = (err as DOMException)?.name === 'NotAllowedError' ? 'PERMISSION' : 'NO_MIC';
    throw new VoiceRecordingError('Microphone access denied', code);
  }

  const mimeType = pickMimeType();
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: TARGET_BITRATE_BPS } : undefined);
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    throw new VoiceRecordingError('MediaRecorder unsupported', 'NO_RECORDER');
  }

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  // ── WebAudio analyser for the waveform ─────────────────────────────────
  const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  const sourceNode = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  sourceNode.connect(analyser);

  const waveformBuckets: number[] = [];
  const sampleBuf = new Float32Array(analyser.fftSize);
  let bucketTimer: ReturnType<typeof setInterval> | null = null;

  const startedAt = Date.now();
  let stopped = false;

  // Push one waveform bucket roughly every (MAX_RECORDING_SEC / WAVEFORM_BUCKETS)
  // ≈ 0.94 s. If the recording is shorter, we just have fewer buckets.
  const bucketIntervalMs = Math.max(50, Math.floor((MAX_RECORDING_SEC * 1000) / WAVEFORM_BUCKETS));
  bucketTimer = setInterval(() => {
    analyser.getFloatTimeDomainData(sampleBuf);
    let sumSq = 0;
    for (let i = 0; i < sampleBuf.length; i++) sumSq += sampleBuf[i] * sampleBuf[i];
    const rms = Math.sqrt(sumSq / sampleBuf.length);
    // Boost a little — typical speech RMS sits around 0.05–0.15.
    const v = Math.min(1, rms * 4);
    if (waveformBuckets.length < WAVEFORM_BUCKETS) waveformBuckets.push(v);
    else waveformBuckets[WAVEFORM_BUCKETS - 1] = v;
  }, bucketIntervalMs);

  // Auto-stop at MAX_RECORDING_SEC so the file never exceeds 1 MiB.
  const autoStopTimer = setTimeout(() => {
    if (recorder.state === 'recording') recorder.stop();
  }, MAX_RECORDING_SEC * 1000);

  recorder.start();

  function cleanup() {
    if (bucketTimer) { clearInterval(bucketTimer); bucketTimer = null; }
    clearTimeout(autoStopTimer);
    stream.getTracks().forEach((t) => t.stop());
    try { sourceNode.disconnect(); } catch { /* ignore */ }
    try { void audioCtx.close(); } catch { /* ignore */ }
  }

  return {
    elapsedSec(): number {
      return (Date.now() - startedAt) / 1000;
    },
    currentWaveform(): number[] {
      return waveformBuckets.slice();
    },
    async stop(): Promise<VoiceRecording> {
      if (stopped) throw new VoiceRecordingError('Already stopped', 'ALREADY_STOPPED');
      stopped = true;

      // Wait for the final data chunk
      const finalBlob = await new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
          resolve(blob);
        };
        if (recorder.state !== 'inactive') recorder.stop();
        else resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' }));
      });

      cleanup();

      if (finalBlob.size === 0) throw new VoiceRecordingError('Empty recording', 'EMPTY');

      const durationSec = Math.max(0.1, (Date.now() - startedAt) / 1000);
      const audio = await blobToBase64(finalBlob);
      return {
        audio,
        mimeType: finalBlob.type || 'audio/webm',
        durationSec,
        waveform: waveformBuckets.slice(),
        size: finalBlob.size,
      };
    },
    cancel(): void {
      if (stopped) return;
      stopped = true;
      try { if (recorder.state !== 'inactive') recorder.stop(); } catch { /* ignore */ }
      cleanup();
    },
  };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result as string;
      const i = r.indexOf(',');
      resolve(i >= 0 ? r.slice(i + 1) : r);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** True if a recording is small enough to send inline via the relay. */
export function isVoiceWithinRelayCap(rec: VoiceRecording): boolean {
  const fakeCapture: Capture = {
    kind: 'camera',
    mediaType: 'image',
    data: rec.audio,
    mimeType: rec.mimeType,
    filename: 'voice',
    size: rec.size,
  };
  return isWithinRelayCap(fakeCapture);
}
