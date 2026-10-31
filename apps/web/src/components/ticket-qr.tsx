import QRCode from 'qrcode';
import { useMemo } from 'react';

interface TicketQrProps {
  code: string;
  label: string;
  size?: number;
}

export function TicketQr({ code, label, size = 128 }: TicketQrProps) {
  const { path, modules } = useMemo(() => {
    const qr = QRCode.create(code, { errorCorrectionLevel: 'M' });
    const count = qr.modules.size;
    let d = '';
    for (let y = 0; y < count; y += 1) {
      for (let x = 0; x < count; x += 1) {
        if (qr.modules.get(x, y)) d += `M${x},${y}h1v1h-1z`;
      }
    }
    return { path: d, modules: count };
  }, [code]);

  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`-2 -2 ${modules + 4} ${modules + 4}`}
      shapeRendering="crispEdges"
      className="rounded-control"
    >
      <rect x={-2} y={-2} width={modules + 4} height={modules + 4} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}
