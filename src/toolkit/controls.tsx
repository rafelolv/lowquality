import type { Options } from "../lib/toolkit/protocol";
export function NumberField({
  label,
  value,
  onChange,
  min = 1,
  max = 8192,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) =>
          onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))
        }
      />
    </label>
  );
}
export function OutputControls({
  options,
  change,
}: {
  options: Options;
  change: (patch: Partial<Options>) => void;
}) {
  return (
    <div className="toolkit-fields">
      <label className="field">
        <span className="field__label">Output format</span>
        <select
          aria-label="Output format"
          value={options.format}
          onChange={(e) =>
            change({ format: e.target.value as Options["format"] })
          }
        >
          <option value="png">PNG</option>
          <option value="jpeg">JPG</option>
          <option value="webp">WebP</option>
        </select>
      </label>
      {options.format !== "png" && (
        <label className="field">
          <span className="field__label">
            Quality {Math.round(options.quality * 100)}%
          </span>
          <input
            className="pixel-range"
            aria-label="Output quality"
            type="range"
            min="30"
            max="100"
            value={options.quality * 100}
            onChange={(e) => change({ quality: Number(e.target.value) / 100 })}
          />
        </label>
      )}
    </div>
  );
}
