import { Crop, Files, Info, AppWindow, Scan, Film } from "lucide-react";
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
export function ToolboxCards() {
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
    </div>
  );
}
