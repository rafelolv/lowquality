import { Flame, ShieldCheck } from "lucide-react";
import type { CSSProperties } from "react";
import { qualityDescriptor, QUALITY_TICKS } from "../lib/presets";

interface QualitySliderProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  compact?: boolean;
}

type SliderStyle = CSSProperties & { "--range-progress": string };

export function QualitySlider({
  value,
  onChange,
  disabled = false,
  compact = false,
}: QualitySliderProps) {
  const style: SliderStyle = { "--range-progress": `${value}%` };
  const descriptor = qualityDescriptor(value);

  return (
    <section
      className={`panel quality-panel${compact ? " quality-panel--compact" : ""}`}
      aria-labelledby="how-bad-heading"
    >
      <div className="panel__header">
        <h2 className="panel__title" id="how-bad-heading">
          <Flame size={16} aria-hidden="true" />
          Damage level
        </h2>
        <span
          className={`quality-readout${value === 0 ? " quality-readout--clean" : ""}`}
        >
          {value === 0 ? (
            <>
              <ShieldCheck size={13} aria-hidden="true" />
              Intact
            </>
          ) : (
            `${value} / 100`
          )}
        </span>
      </div>

      <div className="quality-panel__body">
        <p className="quality-panel__explanation">
          More JPEG damage. Fewer surviving details. Pixelation is optional.
        </p>
        <div className="quality-panel__heading">
          <span className="quality-panel__question">How bad?</span>
          <span className="quality-panel__descriptor" aria-live="polite">
            {descriptor}
          </span>
        </div>

        <input
          id="how-bad"
          className="pixel-range pixel-range--hero"
          type="range"
          min={0}
          max={100}
          step={1}
          value={value}
          disabled={disabled}
          style={style}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
          aria-label="How bad should the image look"
          aria-valuetext={`${value} out of 100, ${descriptor}`}
        />

        <div className="quality-panel__ticks" aria-hidden="true">
          {QUALITY_TICKS.map((tick) => (
            <span
              key={tick.value}
              className={`quality-tick${value >= tick.value && value > 0 ? " quality-tick--lit" : ""}`}
              style={{ left: `${tick.value}%` }}
            >
              <span className="quality-tick__mark" />
              <span className="quality-tick__label">{tick.label}</span>
            </span>
          ))}
        </div>

        <div className="quality-panel__hint">
          <span>
            <strong>0</strong> keeps the source pristine
          </span>
          <span>
            <strong>100</strong> is a war crime
          </span>
        </div>
      </div>
    </section>
  );
}
