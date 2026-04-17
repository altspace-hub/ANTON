/**
 * capture.ts — camera + share-target wrappers per spec §8.5.
 *
 * Three capture sources:
 *   1. Camera (@capacitor/camera) — native photo capture; web fallback
 *      uses a hidden <input type="file" capture="environment"> for
 *      desktop / PWA users.
 *   2. Photo library (@capacitor/camera Photos) — pick existing image.
 *   3. Share intent — Android intent-filter (declared in
 *      AndroidManifest.xml) and Web Share Target API. The launching
 *      payload arrives as ?shared=text&shared_url=... query string;
 *      App.tsx can hand it to the capture flow.
 */

import { Capacitor } from '@capacitor/core';

export type CaptureKind = 'camera' | 'library' | 'shared';

export interface Capture {
  kind: CaptureKind;
  /** Base64 (sans data URL prefix) when image; raw text/url otherwise */
  data: string;
  mimeType: string;
  filename: string;
  /** Bytes — useful for upload progress UI */
  size: number;
  /** True when the capture is text/URL (not a binary asset) */
  isText: boolean;
  /** Original source URL for shared web pages */
  shareUrl?: string;
}

// ── Camera / library (Capacitor) with web fallback ─────────────────────

export async function captureFromCamera(): Promise<Capture | null> {
  return capacitorCamera('CAMERA') ?? webFileInput('environment');
}

export async function captureFromLibrary(): Promise<Capture | null> {
  return capacitorCamera('PHOTOS') ?? webFileInput();
}

async function capacitorCamera(source: 'CAMERA' | 'PHOTOS'): Promise<Capture | null> {
  if (Capacitor.getPlatform() === 'web') return null;
  try {
    const mod = await import('@capacitor/camera');
    const { Camera, CameraResultType, CameraSource } = mod as unknown as {
      Camera: { getPhoto(opts: Record<string, unknown>): Promise<{ base64String?: string; format?: string }> };
      CameraResultType: { Base64: string };
      CameraSource: { Camera: string; Photos: string };
    };
    const photo = await Camera.getPhoto({
      resultType: CameraResultType.Base64,
      source: source === 'CAMERA' ? CameraSource.Camera : CameraSource.Photos,
      // Phase I fix Arch-3 — keep payloads under the 1MB server cap.
      // 70% JPEG quality + 2048px max width is OCR-grade for documents
      // and good for portraits without exceeding ~750KB on most devices.
      quality: 70,
      width: 2048,
      allowEditing: false,
      correctOrientation: true,
    });
    const data = photo.base64String ?? '';
    if (!data) return null;
    const fmt = photo.format ?? 'jpeg';
    const mimeType = `image/${fmt === 'jpg' ? 'jpeg' : fmt}`;
    return {
      kind: source === 'CAMERA' ? 'camera' : 'library',
      data, mimeType,
      filename: `capture-${Date.now()}.${fmt}`,
      size: Math.floor((data.length * 3) / 4),
      isText: false,
    };
  } catch {
    return null;
  }
}

async function webFileInput(capture?: 'environment' | 'user'): Promise<Capture | null> {
  if (typeof document === 'undefined') return null;
  return new Promise<Capture | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf';
    if (capture) input.capture = capture;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      // For images, resize / re-encode under 1MB before base64 (Arch-3).
      // PDFs and other types pass through unchanged — caller's
      // responsibility to keep them small.
      let data: string;
      let mimeType = file.type || 'image/jpeg';
      let size = file.size;
      if (file.type.startsWith('image/')) {
        const r = await resizeImageToBase64(file, 2048, 0.7);
        data = r.base64;
        mimeType = 'image/jpeg';                // resize always emits JPEG
        size = Math.floor((data.length * 3) / 4);
      } else {
        data = await fileToBase64(file);
      }
      resolve({
        kind: capture ? 'camera' : 'library',
        data, mimeType,
        filename: file.name || `capture-${Date.now()}`,
        size,
        isText: false,
      });
    };
    input.click();
  });
}

/** Resize an image File to fit within maxDim and emit base64 JPEG at the given quality. */
async function resizeImageToBase64(file: File, maxDim: number, quality: number): Promise<{ base64: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Image decode failed'));
      i.src = url;
    });
    let { width, height } = img;
    if (width > maxDim || height > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not available');
    ctx.drawImage(img, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const i = dataUrl.indexOf(',');
    return { base64: i >= 0 ? dataUrl.slice(i + 1) : dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const i = result.indexOf(',');
      resolve(i >= 0 ? result.slice(i + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// ── Share intent — picked up at startup ────────────────────────────────

export function readSharedFromUrl(): Capture | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const text = params.get('shared') ?? params.get('shared_text');
  const url = params.get('shared_url') ?? params.get('url');
  if (!text && !url) return null;
  const data = text ?? url ?? '';
  return {
    kind: 'shared',
    data,
    mimeType: 'text/plain',
    filename: `share-${Date.now()}.txt`,
    size: data.length,
    isText: true,
    shareUrl: url ?? undefined,
  };
}
