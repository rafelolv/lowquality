import { NumberField } from "../controls";
import { squareCrop, aspectCrop, clampCrop } from "../../lib/toolkit/geometry";
import type { Options, Result } from "../../lib/toolkit/protocol";
export function FaviconTool({
  options,
  source,
  change,
}: {
  options: Options;
  source: Result;
  change: (patch: Partial<Options>) => void;
}) {
  const crop = aspectCrop(
    options.crop ?? squareCrop(source.width, source.height),
    source.width,
    source.height,
    1,
  );
  return (
    <>
      <label>
        <input
          type="checkbox"
          checked={options.padding}
          onChange={(e) => change({ padding: e.target.checked })}
        />
        Padding (off = draggable square crop)
      </label>
      {!options.padding && (
        <div className="toolkit-fields">
          {(["x", "y", "width"] as const).map((key) => (
            <NumberField
              key={key}
              label={`Icon crop ${key === "width" ? "size" : key}`}
              value={crop[key]}
              min={key === "width" ? 1 : 0}
              max={
                key === "width" ? Math.min(source.width, source.height) : 8192
              }
              onChange={(value) =>
                change({
                  crop: clampCrop(
                    {
                      ...crop,
                      [key]: value,
                      ...(key === "width" ? { height: value } : {}),
                    },
                    source.width,
                    source.height,
                  ),
                })
              }
            />
          ))}
        </div>
      )}
      <label className="field">
        <span className="field__label">Background color</span>
        <input
          type="color"
          value={options.background}
          onChange={(e) => change({ background: e.target.value })}
        />
      </label>
      <p>
        Includes PNG 16/32/48/180/192/512, multi-size ICO, manifest and HTML
        snippet.
      </p>
    </>
  );
}
