import { ArrowLeftRight, Minimize2 } from "lucide-react";
import type { ToolMode } from "../types";

interface ToolsSectionProps {
  onOpenTool: (mode: ToolMode) => void;
}

export function ToolsSection({ onOpenTool }: ToolsSectionProps) {
  return (
    <section
      className="site-section site-section--tools"
      id="tools"
      aria-labelledby="tools-heading"
    >
      <div className="container">
        <div className="section-heading">
          <p className="eyebrow">The mercy department</p>
          <h2 id="tools-heading">
            Not every image{" "}
            <span className="text-yellow">needs to suffer.</span>
          </h2>
          <p>
            Clean tools for the files you actually want to keep. Same local-only
            deal: nothing leaves this tab.
          </p>
        </div>

        <a className="button" href="#toolbox">
          Open Toolbox
        </a>
        <div className="tools-grid tools-grid--features">
          <button
            type="button"
            className="panel tool-card"
            onClick={() => onOpenTool("convert")}
            data-testid="open-converter-card"
          >
            <span className="tool-card__icon" aria-hidden="true">
              <ArrowLeftRight size={22} />
            </span>
            <span className="tool-card__title">Convert</span>
            <span className="tool-card__body">
              Change image format between PNG, JPG and WebP. Keep the original
              dimensions.
            </span>
            <span className="tool-card__cta">Open converter →</span>
          </button>

          <button
            type="button"
            className="panel tool-card"
            onClick={() => onOpenTool("compress")}
            data-testid="open-compressor-card"
          >
            <span
              className="tool-card__icon tool-card__icon--green"
              aria-hidden="true"
            >
              <Minimize2 size={22} />
            </span>
            <span className="tool-card__title">Compress</span>
            <span className="tool-card__body">
              Reduce file size to a target. Choose how much quality and
              resolution to keep.
            </span>
            <span className="tool-card__cta">Open compressor →</span>
          </button>
        </div>
      </div>
    </section>
  );
}
