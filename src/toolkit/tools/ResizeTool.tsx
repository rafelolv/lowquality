import type { Options, Result } from "../../lib/toolkit/protocol";
import {
  SOCIAL_PRESETS,
  clampCrop,
  aspectCrop,
  type Rect,
} from "../../lib/toolkit/geometry";
import { NumberField } from "../controls";
export function ResizeTool({
  options,
  source,
  change,
  locked,
  setLocked,
  cropLocked,
  setCropLocked,
  preset,
  setPreset,
  size,
  cropChange,
}: {
  options: Options;
  source: Result;
  change: (patch: Partial<Options>) => void;
  locked: boolean;
  setLocked: (value: boolean) => void;
  cropLocked: boolean;
  setCropLocked: (value: boolean) => void;
  preset: string;
  setPreset: (value: string) => void;
  size: (axis: "width" | "height", value: number) => void;
  cropChange: (rect: Rect) => void;
}) {
  return (
    <>
      <label className="field">
        <span className="field__label">Social preset</span>
        <select
          aria-label="Social preset"
          value={preset}
          onChange={(e) => {
            const selected = SOCIAL_PRESETS.find(
              (item) => item[0] === e.target.value,
            )!;
            setPreset(selected[0]);
            if (selected[1])
              change({
                width: selected[1],
                height: selected[2],
              });
          }}
        >
          {SOCIAL_PRESETS.map(([name, w, h]) => (
            <option key={name} value={name}>
              {name}
              {w ? ` ${w}×${h}` : ""}
            </option>
          ))}
        </select>
      </label>
      <div className="toolkit-fields">
        <NumberField
          label="Width"
          value={options.width}
          onChange={(value) => size("width", value)}
        />
        <NumberField
          label="Height"
          value={options.height}
          onChange={(value) => size("height", value)}
        />
      </div>
      <label>
        <input
          type="checkbox"
          checked={locked}
          onChange={(e) => setLocked(e.target.checked)}
        />
        Lock output proportions
      </label>
      <label>
        <input
          type="checkbox"
          checked={cropLocked}
          onChange={(e) => {
            setCropLocked(e.target.checked);
            if (e.target.checked)
              change({
                crop: aspectCrop(
                  options.crop ?? {
                    x: 0,
                    y: 0,
                    width: source.width,
                    height: source.height,
                  },
                  source.width,
                  source.height,
                  options.width / options.height,
                ),
              });
          }}
        />
        Lock crop to output ratio
      </label>
      <label className="field">
        <span className="field__label">Fit mode</span>
        <select
          aria-label="Fit mode"
          value={options.fit}
          onChange={(e) => change({ fit: e.target.value as Options["fit"] })}
        >
          <option value="contain">Contain</option>
          <option value="cover">Cover / crop</option>
        </select>
      </label>
      <div className="toolkit-fields">
        {(["x", "y", "width", "height"] as const).map((key) => (
          <NumberField
            key={key}
            label={`Crop ${key}`}
            min={key === "x" || key === "y" ? 0 : 1}
            value={
              (options.crop ?? {
                x: 0,
                y: 0,
                width: source.width,
                height: source.height,
              })[key]
            }
            onChange={(value) =>
              cropChange(
                clampCrop(
                  {
                    ...(options.crop ?? {
                      x: 0,
                      y: 0,
                      width: source.width,
                      height: source.height,
                    }),
                    [key]: value,
                  },
                  source.width,
                  source.height,
                ),
              )
            }
          />
        ))}
      </div>
      <div className="toolkit-actions">
        <button
          className="button button--ghost"
          onClick={() =>
            change({
              rotation: (options.rotation + 90) % 360,
              width: options.height,
              height: options.width,
            })
          }
        >
          Rotate 90° ({options.rotation}°)
        </button>
        <button
          className="button button--ghost"
          aria-pressed={options.flipX}
          onClick={() => change({ flipX: !options.flipX })}
        >
          Flip horizontal
        </button>
        <button
          className="button button--ghost"
          aria-pressed={options.flipY}
          onClick={() => change({ flipY: !options.flipY })}
        >
          Flip vertical
        </button>
        <button
          className="button button--ghost"
          onClick={() =>
            change({
              crop: undefined,
              rotation: 0,
              flipX: false,
              flipY: false,
              width: source.width,
              height: source.height,
            })
          }
        >
          Reset crop
        </button>
      </div>
    </>
  );
}
