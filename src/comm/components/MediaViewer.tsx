/**
 * MediaViewer — full-screen lightbox for an image message bubble.
 *
 * Mirrors the ViewOnceViewer overlay pattern in ChatThreadScreen
 * (dark backdrop, X button, Android-back registration, useBlobUrl for
 * the decoded image) but without the view-once wipe semantics — this is
 * a plain, dismissible photo viewer. The full image is centered and
 * scaled to fit within the viewport (object-contain, never cropped).
 *
 * Dismiss paths: tap the backdrop, tap the X button, or Android back.
 */

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useBlobUrl } from '../hooks/useBlobUrl';
import { Ico } from './Ico';
import { registerBackHandler } from '../services/back-stack';

interface Props {
  /** Base64 image bytes (no data-URL prefix). */
  data: string;
  mimeType: string;
  /** Alt text / filename for a11y. */
  alt?: string;
  onClose: () => void;
}

export default function MediaViewer({ data, mimeType, alt, onClose }: Props) {
  const { t } = useTranslation();
  const blobUrl = useBlobUrl(data, mimeType);
  useEffect(() => registerBackHandler(onClose), [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('chat.photo', 'Photo')}
      className="fixed inset-0 z-50 flex flex-col bg-black"
      onClick={onClose}
    >
      <header className="flex items-center justify-end px-4 h-12 safe-top flex-shrink-0">
        <button
          onClick={onClose}
          aria-label={t('common.close', 'Close')}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#FFFFFF' }}
        >
          <Ico name="x" size={20} color="#FFFFFF" />
        </button>
      </header>
      <div className="flex-1 flex items-center justify-center px-2 pb-2 min-h-0">
        {blobUrl && (
          <img
            src={blobUrl}
            alt={alt ?? ''}
            className="max-w-full max-h-full object-contain"
            // Tapping the image itself also closes — feels natural and
            // matches the backdrop tap. stopPropagation isn't needed.
          />
        )}
      </div>
    </div>
  );
}
