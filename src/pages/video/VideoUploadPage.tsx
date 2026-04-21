// ── VideoUploadPage.tsx ─────────────────────────────────────────────────────
// /video/upload — two-step: (1) create upload row + metadata, (2) push the
// body as base64. 2 GB cap per Q7. v1 skips transcoding — we stream the
// original MP4 with range requests.

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Upload, ArrowLeft } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

const MAX_BYTES = 2 * 1024 * 1024 * 1024;

export default function VideoUploadPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'friends-circle' | 'unlisted' | 'private'>('private');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function upload() {
    if (!file || !title.trim() || busy) return;
    if (file.size > MAX_BYTES) { setError('File exceeds 2 GB limit'); return; }
    setBusy(true); setError(null); setProgress(0);
    try {
      const initRes = await fetchWithAuth('/api/video/uploads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          visibility,
          source_size_bytes: file.size,
        }),
      });
      if (!initRes.ok) {
        const j = await initRes.json().catch(() => ({}));
        throw new Error(j.error || `Init failed (${initRes.status})`);
      }
      const { id } = await initRes.json() as { id: string };

      // Chunk-at-a-time upload via base64. Keeps this pragmatic for v1;
      // S3-style multipart lands with the MinIO adapter flip.
      const buf = await file.arrayBuffer();
      const base64 = arrayBufferToBase64(buf);
      setProgress(50);
      const bodyRes = await fetchWithAuth('/api/video/uploads/body', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_id: id, chunk_base64: base64 }),
      });
      if (!bodyRes.ok) {
        const j = await bodyRes.json().catch(() => ({}));
        throw new Error(j.error || `Upload failed (${bodyRes.status})`);
      }
      setProgress(100);
      navigate(`/video/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <div className="max-w-2xl mx-auto p-6 space-y-5">
        <Link to="/video" className="text-adv-teal text-sm inline-flex items-center gap-1">
          <ArrowLeft size={14} /> Back to video
        </Link>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Upload className="text-adv-teal" size={22} /> Upload video
        </h1>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-adv-gray">Title</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="mt-1 w-full bg-adv-card border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-adv-teal"
            />
          </div>
          <div>
            <label className="text-xs text-adv-gray">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full bg-adv-card border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-adv-teal"
            />
          </div>
          <div>
            <label className="text-xs text-adv-gray">Visibility</label>
            <select
              value={visibility}
              onChange={e => setVisibility(e.target.value as typeof visibility)}
              className="mt-1 w-full bg-adv-card border border-border rounded px-3 py-2 text-sm"
            >
              <option value="private">Private (only you)</option>
              <option value="friends-circle">Friends circle</option>
              <option value="unlisted">Unlisted (anyone with link)</option>
              <option value="public">Public</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-adv-gray">File (MP4 / WebM, max 2 GB)</label>
            <input
              type="file"
              accept="video/*"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 w-full text-sm file:mr-3 file:px-3 file:py-1 file:border-0 file:bg-adv-teal file:text-adv-dark file:rounded"
            />
            {file && (
              <div className="text-xs text-adv-gray mt-1">
                {file.name} — {(file.size / (1024 * 1024)).toFixed(1)} MB
              </div>
            )}
          </div>

          {error && <div className="rounded bg-adv-red/10 text-adv-red p-2 text-sm">{error}</div>}
          {busy && (
            <div className="rounded bg-adv-teal/10 text-adv-teal p-2 text-sm">
              Uploading… {progress}%
            </div>
          )}

          <button
            onClick={() => void upload()}
            disabled={!file || !title.trim() || busy}
            className="w-full px-4 py-2 bg-adv-teal text-adv-dark rounded font-medium disabled:opacity-50"
          >
            Upload
          </button>
        </div>
      </div>
    </div>
  );
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
