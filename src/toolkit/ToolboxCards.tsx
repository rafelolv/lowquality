import {
  ArrowLeftRight,
  AppWindow,
  Crop,
  Files,
  Film,
  Info,
  Minimize2,
  Scan,
} from "lucide-react";
import type { ToolMode } from "../types";
export const tools = [
  {
    id: "resize",
    name: "Resize & Crop",
    icon: Crop,
    description: "New dimensions. Same dignity.",
  },
  {
    id: "batch",
    name: "Batch",
    icon: Files,
    description: "One queue. A little mercy for every file.",
  },
  {
    id: "metadata",
    name: "Metadata",
    icon: Info,
    description: "Read the fine print. Leave less behind.",
  },
  {
    id: "favicon",
    name: "Favicon",
    icon: AppWindow,
    description: "Tiny icons. Full app kit.",
  },
  {
    id: "redact",
    name: "Redact",
    icon: Scan,
    description: "Pixelate or blur selected regions.",
  },
  {
    id: "gif",
    name: "GIF Kit",
    icon: Film,
    description: "Frames, timing, palettes. Still moving.",
  },
] as const;
export function ToolboxCards({
  onOpenTool,
}: {
  onOpenTool: (mode: ToolMode) => void;
}) {
  return (
    <div className="tools-grid toolkit-cards">
      {tools.map(({ id, name, icon: Icon, description }) => (
        <a key={id} className="panel tool-card" href={`#toolbox/${id}`}>
          <span className="tool-card__icon">
            <Icon size={24} />
          </span>
          <span className="tool-card__title">{name}</span>
          <span className="tool-card__body">{description}</span>
          <span className="tool-card__cta">Open tool</span>
        </a>
      ))}
      <button
        type="button"
        className="panel tool-card"
        onClick={() => onOpenTool("convert")}
        data-testid="toolbox-convert-card"
      >
        <span className="tool-card__icon" aria-hidden="true">
          <ArrowLeftRight size={24} />
        </span>
        <span className="tool-card__title">Convert</span>
        <span className="tool-card__body">
          Convert PNG, JPG and WebP locally. JPG and WebP can be lossy.
        </span>
        <span className="tool-card__cta">Open converter</span>
      </button>
      <button
        type="button"
        className="panel tool-card"
        onClick={() => onOpenTool("compress")}
        data-testid="toolbox-compress-card"
      >
        <span
          className="tool-card__icon tool-card__icon--green"
          aria-hidden="true"
        >
          <Minimize2 size={24} />
        </span>
        <span className="tool-card__title">Compress</span>
        <span className="tool-card__body">
          Set a size target and quality floor. Resolution only shrinks when
          needed.
        </span>
        <span className="tool-card__cta">Open compressor</span>
      </button>
    </div>
  );
}
