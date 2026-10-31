import { type Ref, type SelectHTMLAttributes, useId } from 'react';

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string | undefined;
  options: readonly { value: string; label: string }[];
  ref?: Ref<HTMLSelectElement>;
}

export function SelectField({
  label,
  error,
  options,
  id,
  className,
  ref,
  ...props
}: SelectFieldProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const errorId = error ? `${selectId}-error` : undefined;

  return (
    <div className={`flex flex-col gap-1 ${className ?? ''}`.trim()}>
      <label htmlFor={selectId} className="text-sm font-medium">
        {label}
      </label>
      <select
        ref={ref}
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        className={`h-11 rounded-control border bg-surface px-3 text-base text-ink ${
          error ? 'border-danger' : 'border-line'
        }`}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <p id={errorId} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
