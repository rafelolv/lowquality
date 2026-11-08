import { ChevronDown, RotateCcw, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import type {
  DegradationSettings,
  EffectKey,
  EnabledEffects,
  SettingsOverrides,
} from "../types";
import { EFFECT_KEYS } from "../types";
import { RangeControl } from "./ui/RangeControl";
import { Switch } from "./ui/Switch";

interface AdvancedControlsProps {
  settings: DegradationSettings;
  enabled: EnabledEffects;
  overrides: SettingsOverrides;
  onOverride: <K extends keyof DegradationSettings>(
    key: K,
    value: DegradationSettings[K],
  ) => void;
  onEffectEnabledChange: (key: EffectKey, enabled: boolean) => void;
  onReset: () => void;
}

interface EffectControl {
  effect: EffectKey;
  setting: keyof DegradationSettings;
  label: string;
  min: number;
  max: number;
  step?: number;
  format: (value: number) => string;
  hint?: string;
}

const CONTROLS: EffectControl[] = [
  {
    effect: "jpeg",
    setting: "jpegQuality",
    label: "JPEG Quality",
    min: 1,
    max: 100,
    format: (value) => `${value}%`,
    hint: "Lower means stronger JPEG ringing, smearing and colour bleed.",
  },
  {
    effect: "resolution",
    setting: "resolution",
    label: "Resolution Reduction",
    min: 4,
    max: 100,
    format: (value) => `${value}%`,
    hint: "Shrinks the image, then stretches it back.",
  },
  {
    effect: "pixelate",
    setting: "pixelSize",
    label: "Pixelation",
    min: 1,
    max: 96,
    format: (value) => (value <= 1 ? "Off" : `${value} block`),
    hint: "Turns detail into bold, dishonest blocks.",
  },
  {
    effect: "compressionLoops",
    setting: "compressionPasses",
    label: "Repeated Compression",
    min: 0,
    max: 9,
    format: (value) =>
      value === 0 ? "Single pass" : `+${value} pass${value === 1 ? "" : "es"}`,
    hint: "JPEGs the JPEG again. And again.",
  },
  {
    effect: "noise",
    setting: "noise",
    label: "Noise",
    min: 0,
    max: 100,
    format: (value) => `${value}%`,
    hint: "Sensor dust, but committed.",
  },
  {
    effect: "colors",
    setting: "colorCount",
    label: "Colour Reduction",
    min: 2,
    max: 256,
    format: (value) => `${value} colours`,
    hint: "Squashes the palette into a tiny crayon box.",
  },
  {
    effect: "contrast",
    setting: "contrast",
    label: "Contrast",
    min: 100,
    max: 280,
    format: (value) => `${value}%`,
    hint: "100% is neutral. Above 200% is a choice.",
  },
  {
    effect: "saturation",
    setting: "saturation",
    label: "Saturation",
    min: 0,
    max: 350,
    format: (value) => `${value}%`,
    hint: "More colour. More regret.",
  },
  {
    effect: "sharpen",
    setting: "sharpen",
    label: "Bad Sharpening",
    min: 0,
    max: 100,
    format: (value) => `${value}%`,
    hint: "Creates crunchy halos around every edge.",
  },
  {
    effect: "glitch",
    setting: "glitch",
    label: "Signal Glitch",
    min: 0,
    max: 100,
    format: (value) => `${value}%`,
    hint: "Horizontal tears and misaligned colour channels.",
  },
];

export function AdvancedControls({
  settings,
  enabled,
  overrides,
  onOverride,
  onEffectEnabledChange,
  onReset,
}: AdvancedControlsProps) {
  const [open, setOpen] = useState(false);
  const activeCount = EFFECT_KEYS.filter((key) => enabled[key]).length;
  const customCount = Object.keys(overrides).length;
  const hasTweaks = customCount > 0 || activeCount < EFFECT_KEYS.length;

  return (
    <section
      className={`panel advanced-panel${open ? " advanced-panel--open" : ""}`}
    >
      <div className="panel__header advanced-panel__header">
        <h2 className="panel__title" id="advanced-heading">
          <SlidersHorizontal size={16} aria-hidden="true" />
          Advanced damage
        </h2>
        <div className="advanced-panel__meta">
          {customCount > 0 && (
            <span className="badge badge--yellow">{customCount} custom</span>
          )}
          <span className="panel__meta">{activeCount}/10 on</span>
        </div>
      </div>

      <button
        type="button"
        className="advanced-toggle"
        aria-expanded={open}
        aria-controls="advanced-controls"
        onClick={() => setOpen((value) => !value)}
      >
        <span>{open ? "Hide the knobs" : "Open the knobs"}</span>
        <ChevronDown
          className="advanced-toggle__chevron"
          size={17}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="advanced-panel__body" id="advanced-controls">
          <div className="advanced-note">
            <p>
              These override the automatic curve and <strong>stay put</strong>{" "}
              when you move the damage slider.
            </p>
            <button
              type="button"
              className="text-button"
              onClick={onReset}
              disabled={!hasTweaks}
            >
              <RotateCcw size={13} aria-hidden="true" />
              Reset all
            </button>
          </div>

          <div className="effect-list">
            {CONTROLS.map((control) => {
              const value = settings[control.setting];
              const isOn = enabled[control.effect];
              const overridden = Object.prototype.hasOwnProperty.call(
                overrides,
                control.setting,
              );
              return (
                <div
                  className={`effect-row${isOn ? "" : " effect-row--off"}`}
                  key={control.effect}
                >
                  <Switch
                    checked={isOn}
                    onChange={(checked) =>
                      onEffectEnabledChange(control.effect, checked)
                    }
                    label={`${isOn ? "Disable" : "Enable"} ${control.label}`}
                    className="effect-row__switch"
                  />
                  <RangeControl
                    id={`effect-${control.effect}`}
                    className="effect-row__range"
                    label={control.label}
                    value={value}
                    min={control.min}
                    max={control.max}
                    step={control.step}
                    disabled={!isOn}
                    overridden={overridden}
                    hint={
                      control.effect === "jpeg" || control.effect === "pixelate"
                        ? control.hint
                        : undefined
                    }
                    format={control.format}
                    onChange={(next) => onOverride(control.setting, next)}
                  />
                </div>
              );
            })}
          </div>

          <details className="advanced-help">
            <summary>What do these actually do?</summary>
            <ul>
              <li>
                JPEG Quality adds ringing and colour bleed. Repeated Compression
                accumulates generation loss.
              </li>
              <li>
                Resolution softens detail. Pixelation adds hard blocks only when
                you choose it.
              </li>
              <li>Noise, Glitch and Bad Sharpening add texture and chaos.</li>
              <li>
                Colour, Contrast and Saturation push the palette into deep-fried
                territory.
              </li>
            </ul>
          </details>
        </div>
      )}
    </section>
  );
}
