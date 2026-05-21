/**
 * QrCode — SVG renderer for arbitrary string payloads.
 *
 * Duplicated from src/comm/components/QrCode.tsx + src/business/components/
 * QrDisplay.tsx rather than imported across packages — the dep is tiny
 * (`qrcode` is already in node_modules for the other two apps), and
 * cross-app imports between src/comm/ and src/pay/ would bring along
 * unrelated tree-shaking risk. Lift to a shared location only when a
 * fourth caller appears.
 */
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface Props {
  value: string;
  size?: number;
  color?: string;
  background?: string;
}

export default function QrCode({
  value,
  size = 260,
  color = '#1A1B2E',
  background = '#FFFFFF',
}: Props) {
  const [svg, setSvg] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(value, {
      type: 'svg',
      width: size,
      margin: 2,
      color: { dark: color, light: background },
      errorCorrectionLevel: 'M',
    }).then((s) => {
      if (!cancelled) setSvg(s);
    });
    return () => { cancelled = true; };
  }, [value, size, color, background]);

  return (
    <div
      style={{ width: size, height: size, backgroundColor: background, borderRadius: 16 }}
      // qrcode's SVG output is trusted — we control the input string.
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
