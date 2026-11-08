import {
  Columns2,
  Eye,
  Flame,
  Loader2,
  Maximize2,
  Minus,
  Pause,
  Play,
  Plus,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import type {
  ImageSession,
  NormalizedRect,
  PreviewResult,
  TextLayer,
  ViewMode,
} from "../types";
import { ZOOM_LEVELS } from "../lib/constants";
import { formatDimensions, formatFileSize } from "../lib/imageLoader";
import { formatDuration } from "../lib/files";
import { useElementSize } from "../hooks/useElementSize";
import { useReducedMotion } from "../hooks/useReducedMotion";

interface PreviewPanelProps {
  session: ImageSession;
  preview: PreviewResult | null;
  busy: boolean;
  progress: number;
  stage: string;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  textEnabled: boolean;
  textLayers: TextLayer[];
  textRects: Array<{ id: string; rect: NormalizedRect }>;
  selectedTextId: string | null;
  onSelectText: (id: string) => void;
  onMoveText: (id: string, x: number, y: number) => void;
  dragActive: boolean;
  onDropFile: (file: File) => void;
}

interface DragState {
  id: string;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export function PreviewPanel({
  session,
  preview,
  busy,
  progress,
  stage,
  viewMode,
  onViewModeChange,
  textEnabled,
  textLayers,
  textRects,
  selectedTextId,
  onSelectText,
  onMoveText,
  dragActive,
  onDropFile,
}: PreviewPanelProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const originalCanvasRef = useRef<HTMLCanvasElement>(null);
  const resultCanvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const completedLoopsRef = useRef(0);
  const size = useElementSize(stageRef);
  const reducedMotion = useReducedMotion();
  const [zoom, setZoom] = useState(1);
  const [split, setSplit] = useState(50);
  const [playing, setPlaying] = useState(!reducedMotion);
  const [frameIndex, setFrameIndex] = useState(0);

  const frames = preview?.frames ?? [];
  const frameCount = frames.length;
  const safeFrameIndex =
    frameCount > 0 ? Math.min(frameIndex, frameCount - 1) : 0;
  const activeFrame = frames[safeFrameIndex] ?? null;
  const isGif = session.kind === "gif";
  const resultVisible = viewMode !== "original";
  const originalVisible = viewMode !== "result";

  useEffect(() => {
    setZoom(1);
    setSplit(50);
    setFrameIndex(0);
  }, [session.sessionId]);

  useEffect(() => {
    if (reducedMotion) setPlaying(false);
  }, [reducedMotion]);

  useEffect(() => {
    completedLoopsRef.current = 0;
    setFrameIndex(0);
  }, [preview]);

  // Draw the untouched source on its own canvas.
  useEffect(() => {
    if (session.kind !== "static") return;
    const canvas = originalCanvasRef.current;
    if (!canvas) return;
    canvas.width = session.width;
    canvas.height = session.height;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(session.originalBitmap, 0, 0);
  }, [session]);

  // Draw whichever degraded frame should currently be visible.
  useEffect(() => {
    const canvas = resultCanvasRef.current;
    if (!canvas) return;
    if (!activeFrame) {
      const context = canvas.getContext("2d");
      context?.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    canvas.width = activeFrame.bitmap.width;
    canvas.height = activeFrame.bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(activeFrame.bitmap, 0, 0);
  }, [activeFrame]);

  // Animated preview playback follows each frame's own delay.
  useEffect(() => {
    if (!isGif || frameCount < 2 || !playing || viewMode === "original") return;
    const delay = Math.max(20, frames[safeFrameIndex]?.delay ?? 100);
    const timer = window.setTimeout(() => {
      if (safeFrameIndex === frameCount - 1) {
        const repeats = session.kind === "gif" ? session.loopCount : -1;
        if (
          repeats !== 0 &&
          completedLoopsRef.current >= Math.max(0, repeats)
        ) {
          setPlaying(false);
          return;
        }
        completedLoopsRef.current += 1;
      }
      setFrameIndex((index) => (index + 1) % frameCount);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [isGif, frameCount, frames, playing, safeFrameIndex, session, viewMode]);

  const padding = 28;
  const availableWidth = Math.max(1, size.width - padding * 2);
  const availableHeight = Math.max(1, size.height - padding * 2);
  const measured = size.width > 0 && size.height > 0;
  const fitScale = measured
    ? Math.min(availableWidth / session.width, availableHeight / session.height)
    : 0;
  const displayWidth = Math.max(1, Math.round(session.width * fitScale * zoom));
  const displayHeight = Math.max(
    1,
    Math.round(session.height * fitScale * zoom),
  );
  const actualPercent = Math.max(1, Math.round(fitScale * zoom * 100));
  const zoomIndex = ZOOM_LEVELS.findIndex(
    (level) => Math.abs(level - zoom) < 0.001,
  );
  const canZoomOut = zoomIndex > 0;
  const canZoomIn = zoomIndex < ZOOM_LEVELS.length - 1;

  const frameStyle: CSSProperties = measured
    ? { width: displayWidth, height: displayHeight }
    : { width: "100%", aspectRatio: `${session.width} / ${session.height}` };

  const resultLayerStyle: CSSProperties | undefined =
    viewMode === "compare" ? { clipPath: `inset(0 0 0 ${split}%)` } : undefined;

  const changeZoom = (direction: -1 | 1) => {
    const nextIndex = Math.min(
      ZOOM_LEVELS.length - 1,
      Math.max(0, (zoomIndex === -1 ? 2 : zoomIndex) + direction),
    );
    setZoom(ZOOM_LEVELS[nextIndex] ?? 1);
  };

  const dragMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const frame = frameRef.current;
    if (!drag || !frame) return;
    const rect = frame.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const nextX = clamp01(
      drag.startX + (event.clientX - drag.startClientX) / rect.width,
    );
    const nextY = clamp01(
      drag.startY + (event.clientY - drag.startClientY) / rect.height,
    );
    onMoveText(drag.id, nextX, nextY);
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      dragRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    }
  };

  return (
    <section
      className={`panel preview-panel${dragActive ? " preview-panel--drag" : ""}`}
      aria-labelledby="preview-heading"
      data-preview-revision={preview?.revision ?? "none"}
      data-preview-busy={busy ? "true" : "false"}
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const file = event.dataTransfer.files[0];
        if (file) onDropFile(file);
      }}
    >
      <div className="preview-panel__top">
        <div className="preview-panel__file">
          <h2
            className="preview-panel__title"
            id="preview-heading"
            title={session.name}
          >
            {session.name}
          </h2>
          <p className="preview-panel__meta">
            {session.format} · {formatDimensions(session.width, session.height)}{" "}
            · {formatFileSize(session.size)}
            {isGif && (
              <>
                {" "}
                · {session.frameCount} frames ·{" "}
                {formatDuration(session.durationMs)}
              </>
            )}
            {isGif && session.wasScaled && (
              <span className="badge badge--yellow preview-panel__scaled">
                Scaled
              </span>
            )}
          </p>
        </div>

        <div className="view-tabs" role="group" aria-label="Preview mode">
          <button
            type="button"
            className={`view-tab${viewMode === "original" ? " view-tab--active" : ""}`}
            aria-pressed={viewMode === "original"}
            onClick={() => onViewModeChange("original")}
          >
            <Eye size={14} aria-hidden="true" />
            Original
          </button>
          <button
            type="button"
            className={`view-tab${viewMode === "result" ? " view-tab--active" : ""}`}
            aria-pressed={viewMode === "result"}
            onClick={() => onViewModeChange("result")}
          >
            <Flame size={14} aria-hidden="true" />
            Destroyed
          </button>
          <button
            type="button"
            className={`view-tab${viewMode === "compare" ? " view-tab--active" : ""}`}
            aria-pressed={viewMode === "compare"}
            onClick={() => onViewModeChange("compare")}
          >
            <Columns2 size={14} aria-hidden="true" />
            Compare
          </button>
        </div>
      </div>

      <div className="preview-stage" ref={stageRef}>
        <div className="preview-stage__scroll">
          <div
            className={`preview-frame preview-frame--${viewMode}`}
            style={frameStyle}
            ref={frameRef}
          >
            <div
              className={`preview-layer preview-layer--original${
                originalVisible ? " is-visible" : ""
              }`}
              aria-hidden={!originalVisible}
            >
              {session.kind === "static" ? (
                <canvas
                  ref={originalCanvasRef}
                  className="preview-canvas"
                  data-testid="original-canvas"
                  role="img"
                  aria-label="Original image"
                />
              ) : (
                <img
                  src={session.originalUrl}
                  alt="Original animated GIF"
                  className="preview-canvas preview-canvas--img"
                  draggable={false}
                  data-testid="original-gif"
                />
              )}
            </div>

            <div
              className={`preview-layer preview-layer--result${
                resultVisible ? " is-visible" : ""
              }`}
              style={resultLayerStyle}
              aria-hidden={!resultVisible}
            >
              <canvas
                ref={resultCanvasRef}
                className="preview-canvas"
                data-testid="result-canvas"
                role="img"
                aria-label="Destroyed image preview"
              />
            </div>

            {viewMode === "compare" && (
              <>
                <span className="compare-label compare-label--original">
                  Original
                </span>
                <span className="compare-label compare-label--result">
                  Destroyed
                </span>
                <div
                  className="compare-divider"
                  style={{ left: `${split}%` }}
                  aria-hidden="true"
                >
                  <span className="compare-divider__handle">
                    <Columns2 size={13} aria-hidden="true" />
                  </span>
                </div>
              </>
            )}

            {textEnabled &&
              viewMode !== "original" &&
              textRects.map(({ id, rect }) => {
                const layer = textLayers.find((item) => item.id === id);
                if (!layer) return null;
                const selected = selectedTextId === id;
                return (
                  <div
                    key={id}
                    className={`text-box${selected ? " text-box--selected" : ""}`}
                    style={{
                      left: `${rect.x * 100}%`,
                      top: `${rect.y * 100}%`,
                      width: `${rect.width * 100}%`,
                      height: `${rect.height * 100}%`,
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`Move text layer: ${layer.text || "empty"}. Use arrow keys to nudge.`}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      dragRef.current = {
                        id,
                        startClientX: event.clientX,
                        startClientY: event.clientY,
                        startX: layer.x,
                        startY: layer.y,
                      };
                      onSelectText(id);
                    }}
                    onPointerMove={dragMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    onKeyDown={(event) => {
                      const step = event.shiftKey ? 0.02 : 0.005;
                      let dx = 0;
                      let dy = 0;
                      if (event.key === "ArrowLeft") dx = -step;
                      else if (event.key === "ArrowRight") dx = step;
                      else if (event.key === "ArrowUp") dy = -step;
                      else if (event.key === "ArrowDown") dy = step;
                      else if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelectText(id);
                        return;
                      } else {
                        return;
                      }
                      event.preventDefault();
                      onSelectText(id);
                      onMoveText(
                        id,
                        clamp01(layer.x + dx),
                        clamp01(layer.y + dy),
                      );
                    }}
                  >
                    <span className="text-box__tag">
                      {selected ? "Drag me" : layer.text.trim() || "Text"}
                    </span>
                    {selected && (
                      <span className="text-box__handle" aria-hidden="true" />
                    )}
                  </div>
                );
              })}

            {!preview && (
              <div className="preview-placeholder" role="status">
                <Loader2
                  className={busy ? "spin" : ""}
                  size={26}
                  aria-hidden="true"
                />
                <strong>
                  {busy ? "Destroying pixels…" : "Preparing preview…"}
                </strong>
                <span>
                  {busy ? stage || "Working locally" : "Almost ready"}
                </span>
              </div>
            )}

            {busy && preview && (
              <div className="preview-status" role="status" aria-live="polite">
                <Loader2 className="spin" size={14} aria-hidden="true" />
                <span>{stage || "Processing"}</span>
                <span className="preview-status__percent">{progress}%</span>
              </div>
            )}

            {dragActive && (
              <div className="preview-drop" aria-hidden="true">
                <UploadGlyph />
                <strong>Drop to replace</strong>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="preview-controls">
        <div className="zoom-control" role="group" aria-label="Preview zoom">
          <button
            type="button"
            className="icon-button"
            onClick={() => changeZoom(-1)}
            disabled={!canZoomOut}
            aria-label="Zoom out"
          >
            <Minus size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="zoom-readout"
            onClick={() => setZoom(1)}
            title="Fit to window"
          >
            <span>{actualPercent}%</span>
            <span className="zoom-readout__mode">
              {zoom === 1 ? <Maximize2 size={11} aria-hidden="true" /> : "zoom"}
            </span>
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => changeZoom(1)}
            disabled={!canZoomIn}
            aria-label="Zoom in"
          >
            <Plus size={15} aria-hidden="true" />
          </button>
        </div>

        {viewMode === "compare" && (
          <label className="split-control">
            <span>Split</span>
            <input
              type="range"
              min={0}
              max={100}
              value={split}
              onChange={(event) => setSplit(Number(event.currentTarget.value))}
              aria-label="Comparison split position"
            />
            <output>{split}%</output>
          </label>
        )}

        {isGif && resultVisible && preview && (
          <div className="playback-control">
            <button
              type="button"
              className="icon-button"
              onClick={() => {
                if (!playing && safeFrameIndex === frameCount - 1) {
                  completedLoopsRef.current = 0;
                  setFrameIndex(0);
                }
                setPlaying((value) => !value);
              }}
              disabled={frameCount < 2}
              aria-label={playing ? "Pause animation" : "Play animation"}
            >
              {playing ? (
                <Pause size={14} aria-hidden="true" />
              ) : (
                <Play size={14} aria-hidden="true" />
              )}
            </button>
            <span>
              {frameCount > 0 ? `${safeFrameIndex + 1}/${frameCount}` : "—"}
            </span>
            <span className="playback-control__mode">
              {reducedMotion && !playing
                ? "Motion paused"
                : playing
                  ? "Playing"
                  : "Paused"}
            </span>
          </div>
        )}

        {viewMode === "original" && (
          <span className="preview-controls__note">
            Source pixels, untouched.
          </span>
        )}
      </div>

      {busy && preview && (
        <div
          className="preview-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          aria-label="Preview processing progress"
        >
          <span style={{ width: `${Math.max(2, progress)}%` }} />
        </div>
      )}
    </section>
  );
}

function UploadGlyph() {
  return (
    <svg
      width="34"
      height="34"
      viewBox="0 0 34 34"
      fill="none"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <path d="M17 5v16M10 12l7-7 7 7" stroke="currentColor" strokeWidth="3" />
      <path d="M5 23v6h24v-6" stroke="currentColor" strokeWidth="3" />
    </svg>
  );
}
