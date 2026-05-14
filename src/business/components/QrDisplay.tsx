/**
 * QrDisplay — renders the `futurechain:pay` URI as a QR code via the
 * `qrcode` npm library. SVG output (sharp at any size).
 */
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface Props {
  value: string;
  size?: number;
  /** Foreground colour of the QR modules. */
  color?: string;
  /** Background colour of the empty quiet zone. */
  background?: string;
}

export default function QrDisplay({
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
      // qrcode's SVG output is trusted (we control the input string).
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
