import type { Options, Result } from "../../lib/toolkit/protocol";
import { NumberField } from "../controls";
export function GifTool({
  options,
  source,
  change,
  run,
}: {
  options: Options;
  source: Result;
  change: (patch: Partial<Options>) => void;
  run: (extract?: boolean) => Promise<void>;
}) {
  return (
    <>
      <p>
        {source.frames?.length ?? 1} frames · Loop{" "}
        {source.loop === 0
          ? "forever"
          : source.loop === -1
            ? "once"
            : source.loop}
      </p>
      <label>
        <input
          type="checkbox"
          checked={options.reverse}
          onChange={(e) => change({ reverse: e.target.checked })}
        />
        Reverse frames
      </label>
      <label className="field">
        <span className="field__label">Speed</span>
        <select
          aria-label="Speed"
          value={options.speed}
          onChange={(e) => change({ speed: Number(e.target.value) })}
        >
          {[0.5, 1, 2].map((speed) => (
            <option key={speed} value={speed}>
              {speed}×
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field__label">Palette colors</span>
        <select
          aria-label="Palette colors"
          value={options.colors}
          onChange={(e) => change({ colors: Number(e.target.value) })}
        >
          {[16, 32, 64, 128, 256].map((colors) => (
            <option key={colors}>{colors}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field__label">
          GIF quality {Math.round(options.quality * 100)}%
        </span>
        <input
          className="pixel-range"
          type="range"
          aria-label="GIF quality"
          min="10"
          max="100"
          value={options.quality * 100}
          onChange={(e) => change({ quality: Number(e.target.value) / 100 })}
        />
      </label>
      <div className="toolkit-fields">
        <NumberField
          label="GIF width"
          value={options.width}
          onChange={(width) => change({ width })}
        />
        <NumberField
          label="GIF height"
          value={options.height}
          onChange={(height) => change({ height })}
        />
      </div>
      <p>
        Quality adjusts palette budget. Timings use 10ms increments, minimum
        20ms. Dimensions stay unchanged unless resized.
      </p>
      <button
        className="button button--secondary"
        onClick={() => void run(true)}
      >
        Extract frames (.zip)
      </button>
    </>
  );
}
