/**
 * capture.ts — image + video capture for the Comm App.
 *
 * Mostly ported from src/app/services/capture.ts (Companion App), extended
 * with video capture/selection. Three sources:
 *   1. Camera (@capacitor/camera) — native photo capture; falls back to
 *      <input type="file" capture="environment"> for web/PWA.
 *   2. Photo library — pick an existing image.
 *   3. Video library / camcorder — record or pick a video.
 *
 * Wire shape: returns a `Capture` whose `data` is base64 (no data-URL
 * prefix). The chat layer encrypts + chunks (Phase next) or sends inline
 * (current — capped at the 1 MiB ciphertext payload).
 */

import { Capacitor } from '@capacitor/core';

export type CaptureKind = 'camera' | 'library' | 'video-camera' | 'video-library';
export type MediaType = 'image' | 'video';

export interface Capture {
  kind: CaptureKind;
  mediaType: MediaType;
  /** Base64 (sans data-URL prefix) */
  data: string;
  mimeType: string;
  filename: string;
  /** Bytes (decoded size — useful for progress / size-cap checks) */
  size: number;
  /** Optional video duration in seconds (best-effort) */
  durationSec?: number;
  /** Optional image/video dimensions */
  width?: number;
  height?: number;
}

// ── Public capture entry points ────────────────────────────────────────

export async function captureImageFromCamera(): Promise<Capture | null> {
  return (await capacitorCameraImage('CAMERA')) ?? webImageInput('environment');
}

export async function captureImageFromLibrary(): Promise<Capture | null> {
  return (await capacitorCameraImage('PHOTOS')) ?? webImageInput();
}

export async function captureVideoFromCamera(): Promise<Capture | null> {
  return webVideoInput('environment');
}

export async function captureVideoFromLibrary(): Promise<Capture | null> {
  return webVideoInput();
}

// ── Capacitor image capture ────────────────────────────────────────────

async function capacitorCameraImage(source: 'CAMERA' | 'PHOTOS'): Promise<Capture | null> {
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
      // Keep under the relay's 1 MiB cap. 70% / 2048px → ~500-750 KB on most devices.
      quality: 70,
      width: 2048,
      allowEditing: false,
      correctOrientation: true,
    });
    const data = photo.base64String ?? '';
    if (!data) return null;
    const fmt = photo.format ?? 'jpeg';
    const mimeType = `image/${fmt === 'jpg' ? 'jpeg' : fmt}`;
    // B3 — read natural dimensions so the chat bubble can reserve the
    // correct aspect-ratio box (avoids reflow + stretch on decode). The
    // Capacitor path previously omitted these; the web path already had
    // them via resizeImageToBase64. Best-effort: a decode failure just
    // leaves width/height undefined and the bubble falls back to 4:3.
    const dims = await readImageDimsFromBase64(data, mimeType);
    return {
      kind: source === 'CAMERA' ? 'camera' : 'library',
      mediaType: 'image',
      data,
      mimeType,
      filename: `image-${Date.now()}.${fmt === 'jpeg' ? 'jpg' : fmt}`,
      size: Math.floor((data.length * 3) / 4),
      width: dims?.width,
      height: dims?.height,
    };
  } catch {
    return null;
  }
}

/**
 * Decode a base64 image into an off-DOM Image element just long enough to
 * read its natural width/height. Returns null on any failure (no document,
 * decode error). Used by the Capacitor capture path which returns base64
 * without dimensions.
 */
async function readImageDimsFromBase64(
  base64: string,
  mimeType: string,
): Promise<{ width: number; height: number } | null> {
  if (typeof document === 'undefined') return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = `data:${mimeType};base64,${base64}`;
  });
}

// ── Web fallbacks ──────────────────────────────────────────────────────

async function webImageInput(capture?: 'environment' | 'user'): Promise<Capture | null> {
  if (typeof document === 'undefined') return null;
  return new Promise<Capture | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (capture) input.capture = capture;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      const r = await resizeImageToBase64(file, 2048, 0.7);
      resolve({
        kind: capture ? 'camera' : 'library',
        mediaType: 'image',
        data: r.base64,
        mimeType: 'image/jpeg',
        filename: file.name || `image-${Date.now()}.jpg`,
        size: Math.floor((r.base64.length * 3) / 4),
        width: r.width,
        height: r.height,
      });
    };
    input.click();
  });
}

async function webVideoInput(capture?: 'environment' | 'user'): Promise<Capture | null> {
  if (typeof document === 'undefined') return null;
  return new Promise<Capture | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    if (capture) input.capture = capture;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      const base64 = await fileToBase64(file);
      const meta = await readVideoMeta(file);
      resolve({
        kind: capture ? 'video-camera' : 'video-library',
        mediaType: 'video',
        data: base64,
        mimeType: file.type || 'video/mp4',
        filename: file.name || `video-${Date.now()}.mp4`,
        size: file.size,
        durationSec: meta.durationSec,
        width: meta.width,
        height: meta.height,
      });
    };
    input.click();
  });
}

// ── Helpers ────────────────────────────────────────────────────────────

interface ResizedImage { base64: string; width: number; height: number; }

async function resizeImageToBase64(file: File, maxDim: number, quality: number): Promise<ResizedImage> {
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
    return { base64: i >= 0 ? dataUrl.slice(i + 1) : dataUrl, width, height };
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

interface VideoMeta { durationSec?: number; width?: number; height?: number; }

function readVideoMeta(file: File): Promise<VideoMeta> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve({ durationSec: v.duration, width: v.videoWidth, height: v.videoHeight });
    };
    v.onerror = () => { URL.revokeObjectURL(url); resolve({}); };
    v.src = url;
  });
}

// ── Sanity limits ──────────────────────────────────────────────────────

/** Relay's wire-format cap (frame.ts MAX_PAYLOAD_BYTES) minus framing overhead. */
export const MAX_RELAY_PAYLOAD_BYTES = 1_000_000;

/**
 * Estimate the on-wire size after JSON+base64 envelope expansion. The
 * EncryptedEnvelope is JSON of base64-encoded fields, so the ciphertext
 * is roughly 1.33× the plaintext bytes. Use 1.4× to leave margin for the
 * JSON envelope shape itself (iv, salt, authTag, AAD hash, field names).
 */
export function estimateOnWireSize(plaintextBytes: number): number {
  return Math.ceil(plaintextBytes * 1.4);
}

/** True if a capture is small enough to send inline via the relay. */
export function isWithinRelayCap(capture: Capture): boolean {
  return estimateOnWireSize(capture.size) <= MAX_RELAY_PAYLOAD_BYTES;
}
