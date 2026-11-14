import {
  ArrowLeftRight,
  AppWindow,
  Clapperboard,
  Crop,
  Files,
  Film,
  Info,
  Minimize2,
  Scan,
} from "lucide-react";
export const tools = [
  {
    id: "convert",
    name: "Convert",
    icon: ArrowLeftRight,
    description: "A new format. Same pixels, fresh start.",
    detail: "PNG · JPG · WebP",
  },
  {
    id: "compress",
    name: "Compress",
    icon: Minimize2,
    description: "Less weight. Keep the detail that matters.",
    detail: "Target size · Quality floor",
  },
  {
    id: "resize",
    detail: "Dimensions · Crop · Rotate",
    name: "Resize & Crop",
    icon: Crop,
    description: "New dimensions. Same dignity.",
  },
  {
    id: "batch",
    detail: "Multiple files · One ZIP",
    name: "Batch",
    icon: Files,
    description: "One queue. A little mercy for every file.",
  },
  {
    id: "metadata",
    detail: "Inspect · Remove EXIF / GPS",
    name: "Metadata",
    icon: Info,
    description: "Read the fine print. Leave less behind.",
  },
  {
    id: "favicon",
    detail: "PNG · ICO · App manifest",
    name: "Favicon",
    icon: AppWindow,
    description: "Tiny icons. Full app kit.",
  },
  {
    id: "redact",
    detail: "Blur · Pixelate · Regions",
    name: "Redact",
    icon: Scan,
    description: "Pixelate or blur selected regions.",
  },
  {
    id: "gif",
    detail: "Frames · Speed · Palettes",
    name: "GIF Kit",
    icon: Film,
    description: "Frames, timing, palettes. Still moving.",
  },
  {
    id: "video",
    detail: "Trim · Sample · Animate",
    name: "Video to GIF",
    icon: Clapperboard,
    description: "Trim a clip, sample frames, encode a GIF.",
  },
] as const;
export function ToolboxCards() {
  return (
    <div className="tools-grid toolkit-cards">
      {tools.map(({ id, name, icon: Icon, description, detail }, index) => (
        <a
          key={id}
          className="panel tool-card"
          href={`#toolbox/${id}`}
          data-testid={`toolbox-${id}-card`}
        >
          <div className="tool-card__top">
            <span className="tool-card__icon" aria-hidden="true">
              <Icon size={24} />
            </span>
            <span className="tool-card__number" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
          </div>
          <span className="tool-card__title">{name}</span>
          <span className="tool-card__body">{description}</span>
          <span className="tool-card__detail">{detail}</span>
          <span className="tool-card__cta">
            Open tool <span aria-hidden="true">↗</span>
          </span>
        </a>
      ))}
    </div>
  );
}
