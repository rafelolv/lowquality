import { Check, Copy, Download, ImageDown, Loader2, X } from "lucide-react";
import type { ExportFormat, ImageSession } from "../types";
import { buildDownloadName } from "../lib/files";

interface ExportBarProps {
  session: ImageSession;
  format: ExportFormat;
  onFormatChange: (format: ExportFormat) => void;
  onDownload: () => void;
  onCopy: () => void;
  onCancel: () => void;
  exporting: boolean;
  exportAction: "download" | "copy" | null;
  progress: number;
  stage: string;
  copySupported: boolean;
  disabled: boolean;
}

const FORMATS: Array<{ id: ExportFormat; label: string; note: string }> = [
  { id: "png", label: "PNG", note: "Lossless, with alpha" },
  { id: "jpeg", label: "JPG", note: "Classic crunchy photo" },
  { id: "webp", label: "WebP", note: "Small and modern" },
  { id: "gif", label: "GIF", note: "Animated frames" },
];

export function ExportBar({
  session,
  format,
  onFormatChange,
  onDownload,
  onCopy,
  onCancel,
  exporting,
  exportAction,
  progress,
  stage,
  copySupported,
  disabled,
}: ExportBarProps) {
  const isGif = session.kind === "gif";
  const filename = buildDownloadName(session, format);
  const busy = exporting;

  return (
    <section className="panel export-bar" aria-labelledby="export-heading">
      <div className="export-bar__main">
        <div className="export-bar__copy">
          <h2 className="export-bar__title" id="export-heading">
            <ImageDown size={17} aria-hidden="true" />
            Export the evidence
          </h2>
          <p>
            {isGif && format === "gif"
              ? "Every frame gets the full treatment. Timing and looping survive."
              : isGif
                ? "PNG, JPG and WebP export the destroyed first frame."
                : "The full-resolution disaster, rendered locally."}
          </p>
        </div>

        <div className="format-picker" role="group" aria-label="Export format">
          {FORMATS.map((item) => {
            const unavailable = item.id === "gif" && !isGif;
            const active = format === item.id;
            return (
              <button
                type="button"
                key={item.id}
                className={`format-option${active ? " format-option--active" : ""}`}
                aria-pressed={active}
                onClick={() => onFormatChange(item.id)}
                disabled={unavailable || exporting}
                title={
                  unavailable
                    ? "Load an animated GIF to export animation."
                    : item.note
                }
                data-testid={`format-${item.id}`}
              >
                {active && (
                  <Check size={11} strokeWidth={3} aria-hidden="true" />
                )}
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="export-bar__dock">
        <div className="export-bar__actions">
          <button
            type="button"
            className="button button--primary button--download"
            onClick={onDownload}
            disabled={disabled || exporting}
            data-testid="download-disaster"
          >
            {exporting && exportAction === "download" ? (
              <Loader2 className="spin" size={18} aria-hidden="true" />
            ) : (
              <Download size={18} aria-hidden="true" />
            )}
            <span>
              {exporting && exportAction === "download"
                ? "COOKING…"
                : "DOWNLOAD DISASTER."}
            </span>
          </button>

          {copySupported && (
            <button
              type="button"
              className="button button--secondary button--copy"
              onClick={onCopy}
              disabled={disabled || exporting}
              data-testid="copy-png"
              title="Copy the destroyed image to the clipboard as PNG"
            >
              {exporting && exportAction === "copy" ? (
                <Loader2 className="spin" size={16} aria-hidden="true" />
              ) : (
                <Copy size={16} aria-hidden="true" />
              )}
              <span className="button--copy-label">Copy PNG</span>
            </button>
          )}
        </div>

        {busy && (
          <div className="export-progress" role="status" aria-live="polite">
            <div className="export-progress__track">
              <span style={{ width: `${Math.max(3, progress)}%` }} />
            </div>
            <span className="export-progress__stage">
              {stage || "Processing"}
            </span>
            <span className="export-progress__percent">{progress}%</span>
            <button
              type="button"
              className="icon-button icon-button--tiny"
              onClick={onCancel}
              aria-label="Cancel export"
            >
              <X size={13} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      <div className="export-bar__foot">
        <span className="export-bar__filename" title={filename}>
          {filename}
        </span>
        <span>No server uploads. No accounts. No mercy.</span>
      </div>
    </section>
  );
}
