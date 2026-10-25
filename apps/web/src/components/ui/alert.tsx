import { CircleAlert, CircleCheck } from 'lucide-react';
import type { ReactNode } from 'react';

interface AlertProps {
  tone: 'danger' | 'success';
  children: ReactNode;
}

export function Alert({ tone, children }: AlertProps) {
  const Icon = tone === 'danger' ? CircleAlert : CircleCheck;
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`flex gap-2 rounded-control border px-3 py-2 text-sm ${
        tone === 'danger' ? 'border-danger text-danger' : 'border-success text-success'
      }`}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
      <div>{children}</div>
    </div>
  );
}
