import { type Ref, type TextareaHTMLAttributes, useId } from 'react';

interface TextareaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string | undefined;
  hint?: string;
  ref?: Ref<HTMLTextAreaElement>;
}

export function TextareaField({
  label,
  error,
  hint,
  id,
  className,
  ref,
  ...props
}: TextareaFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;

  return (
    <div className={`flex flex-col gap-1 ${className ?? ''}`.trim()}>
      <label htmlFor={fieldId} className="text-sm font-medium">
        {label}
      </label>
      <textarea
        ref={ref}
        id={fieldId}
        rows={4}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        className={`rounded-control border bg-surface px-3 py-2 text-base text-ink ${
          error ? 'border-danger' : 'border-line'
        }`}
        {...props}
      />
      {hint && !error && (
        <p id={hintId} className="text-sm text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
