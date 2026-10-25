import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const base =
  'inline-flex h-11 items-center justify-center gap-2 rounded-control px-4 text-base font-semibold transition-opacity duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-60';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-paper hover:opacity-90',
  secondary: 'border border-ink text-ink hover:bg-line',
  ghost: 'text-ink hover:bg-line',
  danger: 'border border-danger text-danger hover:bg-line',
};

export function buttonClasses(variant: ButtonVariant = 'primary', className = '') {
  return `${base} ${variants[variant]} ${className}`.trim();
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  pending?: boolean;
}

export function Button({
  variant = 'primary',
  pending = false,
  disabled,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, className)}
      disabled={disabled === true || pending}
      aria-busy={pending}
      {...props}
    >
      {pending && <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={1.5} />}
      {children}
    </button>
  );
}
