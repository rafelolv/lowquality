import {
  Check,
  Flame,
  FileWarning,
  LayoutGrid,
  ShieldCheck,
  Sparkles,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import type { PresetId } from '../types';
import { PRESETS } from '../lib/presets';

interface PresetGridProps {
  activePreset: PresetId;
  onSelect: (preset: PresetId) => void;
}

const PRESET_ICONS: Record<string, LucideIcon> = {
  original: ShieldCheck,
  'slightly-cursed': Sparkles,
  'crunchy-jpeg': FileWarning,
  'pixel-disaster': LayoutGrid,
  'deep-fried': Flame,
  'absolute-garbage': Trash2,
};

export function PresetGrid({ activePreset, onSelect }: PresetGridProps) {
  return (
    <section className="panel preset-panel" aria-labelledby="presets-heading">
      <div className="panel__header">
        <h2 className="panel__title" id="presets-heading">
          <Sparkles size={16} aria-hidden="true" />
          Presets
        </h2>
        <span className="panel__meta">Six bad ideas</span>
      </div>
      <div className="preset-grid" role="group" aria-label="Destruction presets">
        {PRESETS.map((preset) => {
          const Icon = PRESET_ICONS[preset.id] ?? Sparkles;
          const active = activePreset === preset.id;
          const segments = Math.round(preset.defaultQuality / 20);
          return (
            <button
              type="button"
              key={preset.id}
              className={`preset-card${active ? ' preset-card--active' : ''}`}
              aria-pressed={active}
              onClick={() => onSelect(preset.id)}
            >
              <span className="preset-card__top">
                <Icon size={16} aria-hidden="true" />
                {active && <Check className="preset-card__check" size={14} aria-hidden="true" />}
              </span>
              <span className="preset-card__name">{preset.name}</span>
              <span className="preset-card__desc">{preset.description}</span>
              <span className="preset-card__meter" aria-hidden="true">
                {Array.from({ length: 5 }, (_, index) => (
                  <span
                    key={index}
                    className={index < segments ? 'is-lit' : undefined}
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>
      <p className="preset-panel__hint">
        A preset sets the character. The damage slider still sets the intensity.
      </p>
    </section>
  );
}
