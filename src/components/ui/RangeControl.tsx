import type { CSSProperties } from 'react';

interface RangeControlProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  format: (value: number) => string;
  disabled?: boolean;
  hint?: string;
  overridden?: boolean;
  className?: string;
}

type RangeStyle = CSSProperties & { '--range-progress': string };

export function RangeControl({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  disabled = false,
  hint,
  overridden = false,
  className = '',
}: RangeControlProps) {
  const progress = max === min ? 0 : ((value - min) / (max - min)) * 100;
  const style: RangeStyle = { '--range-progress': `${Math.max(0, Math.min(100, progress))}%` };
  const descriptionId = hint ? `${id}-hint` : undefined;

  return (
    <div
      className={`range-control${disabled ? ' range-control--disabled' : ''}${
        overridden ? ' range-control--overridden' : ''
      }${className ? ` ${className}` : ''}`}
    >
      <div className="range-control__head">
        <label htmlFor={id}>
          {label}
          {overridden && (
            <span className="range-control__custom" title="Changed from the automatic curve">
              custom
            </span>
          )}
        </label>
        <output htmlFor={id} className="range-control__value">
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        className="pixel-range pixel-range--small"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={style}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        aria-valuetext={format(value)}
        aria-describedby={descriptionId}
      />
      {hint && (
        <p className="range-control__hint" id={descriptionId}>
          {hint}
        </p>
      )}
    </div>
  );
}
