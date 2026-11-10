import type { Options, Result } from "../../lib/toolkit/protocol";
import { clampCrop, type Rect } from "../../lib/toolkit/geometry";
import { NumberField } from "../controls";
export function RedactTool({
  options,
  source,
  change,
  regionDraft,
  setRegionDraft,
}: {
  options: Options;
  source: Result;
  change: (patch: Partial<Options>) => void;
  regionDraft: Rect;
  setRegionDraft: import("react").Dispatch<
    import("react").SetStateAction<Rect>
  >;
}) {
  return (
    <>
      <p>Drag to draw rectangles. Redaction is applied to exported pixels.</p>
      <p>
        Weak blur can be partially reversed. Strong pixelation is the default;
        inspect the exported result before sharing.
      </p>
      <label className="field">
        <span className="field__label">Redaction mode</span>
        <select
          aria-label="Redaction mode"
          value={options.mode}
          onChange={(e) =>
            change({
              mode: e.target.value as Options["mode"],
            })
          }
        >
          <option value="pixelate">Pixelate</option>
          <option value="blur">Blur</option>
        </select>
      </label>
      <NumberField
        label={options.mode === "pixelate" ? "Block size" : "Blur strength"}
        value={options.strength}
        min={4}
        max={128}
        onChange={(strength) => change({ strength })}
      />
      <div className="toolkit-fields">
        {(["x", "y", "width", "height"] as const).map((key) => (
          <NumberField
            key={key}
            label={`Rectangle ${key}`}
            value={regionDraft[key]}
            min={key === "x" || key === "y" ? 0 : 1}
            onChange={(value) =>
              setRegionDraft((r) => ({
                ...r,
                [key]: value,
              }))
            }
          />
        ))}
      </div>
      <button
        className="button button--secondary"
        onClick={() =>
          change({
            regions: [
              ...options.regions,
              clampCrop(regionDraft, source.width, source.height),
            ],
          })
        }
      >
        Add rectangle
      </button>
      <div className="toolkit-actions">
        <button
          className="button button--ghost"
          disabled={!options.regions.length}
          onClick={() => change({ regions: options.regions.slice(0, -1) })}
        >
          Undo
        </button>
        <button
          className="button button--ghost"
          disabled={!options.regions.length}
          onClick={() => change({ regions: [] })}
        >
          Clear rectangles
        </button>
      </div>
      {options.regions.map((rect, index) => (
        <button
          className="button button--ghost"
          key={index}
          onClick={() =>
            change({
              regions: options.regions.filter((_, i) => i !== index),
            })
          }
        >
          Remove rectangle {index + 1} ({Math.round(rect.width)}×
          {Math.round(rect.height)})
        </button>
      ))}
    </>
  );
}
