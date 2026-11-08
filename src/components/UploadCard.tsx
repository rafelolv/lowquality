import {
  FileImage,
  ImagePlus,
  Loader2,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";
import type { ImageSession } from "../types";
import { formatDimensions, formatFileSize } from "../lib/imageLoader";

interface UploadCardProps {
  session: ImageSession | null;
  loading: boolean;
  loadingLabel: string;
  dragActive: boolean;
  onPickFile: () => void;
  onTrySample: () => void;
  onReset: () => void;
  onResetEdits: () => void;
  onDropFile: (file: File) => void;
}

export function UploadCard({
  session,
  loading,
  loadingLabel,
  dragActive,
  onPickFile,
  onTrySample,
  onReset,
  onResetEdits,
  onDropFile,
}: UploadCardProps) {
  return (
    <section className="panel upload-card" aria-labelledby="source-heading">
      <div className="panel__header">
        <h2 className="panel__title" id="source-heading">
          <ImagePlus size={16} aria-hidden="true" />
          Source
        </h2>
        <span className={`status-chip${session ? " status-chip--live" : ""}`}>
          {session ? "Loaded" : "Waiting"}
        </span>
      </div>

      {session ? (
        <div className="upload-card__loaded">
          <div className="file-card">
            <span className="file-card__icon" aria-hidden="true">
              <FileImage size={20} />
            </span>
            <div className="file-card__copy">
              <span className="file-card__name" title={session.name}>
                {session.name}
              </span>
              <span className="file-card__meta">
                {session.format} ·{" "}
                {formatDimensions(session.width, session.height)} ·{" "}
                {formatFileSize(session.size)}
              </span>
              {session.kind === "gif" && (
                <span className="file-card__meta">
                  {session.frameCount} frames ·{" "}
                  {session.wasScaled
                    ? `scaled from ${formatDimensions(session.sourceWidth, session.sourceHeight)}`
                    : "animated"}
                </span>
              )}
            </div>
          </div>

          <div className="upload-card__actions">
            <button
              type="button"
              className="button button--ghost button--small"
              onClick={onPickFile}
              disabled={loading}
            >
              <RefreshCw size={14} aria-hidden="true" />
              Replace
            </button>
            <button
              type="button"
              className="button button--ghost button--small"
              onClick={onResetEdits}
              disabled={loading}
            >
              <RotateCcw size={14} aria-hidden="true" />
              Reset edits
            </button>
            <button
              type="button"
              className="button button--danger-quiet button--small"
              onClick={onReset}
              disabled={loading}
            >
              <Trash2 size={14} aria-hidden="true" />
              Clear
            </button>
          </div>

          {loading && (
            <p className="upload-card__loading" role="status">
              <Loader2 className="spin" size={14} aria-hidden="true" />
              {loadingLabel}
            </p>
          )}
        </div>
      ) : (
        <div className="upload-card__empty">
          <div
            className={`dropzone${dragActive ? " dropzone--active" : ""}${
              loading ? " dropzone--busy" : ""
            }`}
            role="button"
            tabIndex={loading ? -1 : 0}
            aria-label="Choose an image or GIF to destroy"
            aria-disabled={loading}
            onClick={() => {
              if (!loading) onPickFile();
            }}
            onKeyDown={(event) => {
              if (loading) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onPickFile();
              }
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const file = event.dataTransfer.files[0];
              if (file) onDropFile(file);
            }}
          >
            <span className="dropzone__icon" aria-hidden="true">
              {loading ? (
                <Loader2 className="spin" size={30} />
              ) : (
                <UploadCloud size={30} />
              )}
            </span>
            <strong>{loading ? loadingLabel : "Drop an image here"}</strong>
            <span>
              {loading
                ? "Destroying pixels locally…"
                : "or click to browse your files"}
            </span>
            <span className="dropzone__formats">
              JPG · PNG · WEBP · AVIF · BMP · SVG · GIF
            </span>
          </div>

          <button
            type="button"
            className="sample-link"
            onClick={onTrySample}
            disabled={loading}
          >
            <Sparkles size={15} aria-hidden="true" />
            No file handy? Try the sample disaster
          </button>
          <p className="upload-card__privacy">Nothing leaves this tab. Ever.</p>
        </div>
      )}
    </section>
  );
}
